/** Checkout workflow — payment confirmation via the saga coordinator */
import { createLogger } from "@delego/utils";
import type { ApiResponse } from "@delego/types";
import { SagaCoordinator, type SagaStep } from "../../src/saga/index.js";
import type { SagaRecord, SagaStore } from "../../src/saga/index.js";
import {
  createWorkflowCorrelationId,
  createWorkflowEventEnvelope,
  publishWorkflowEvent,
  clearPublishedWorkflowEvents,
  type WorkflowEventEnvelope,
} from "../../src/workflow-events.js";

const log = createLogger("orchestrator:checkout", process.env.LOG_LEVEL ?? "info");

export type CheckoutCancellationReason =
  | "user_rejected"
  | "approval_timeout"
  | "funding_failed"
  | "merchant_unavailable"
  | "system_error";

export type CheckoutState =
  | "initiated"
  | "pending_approval"
  | "approved"
  | "funding"
  | "completed"
  | "cancelled";

export interface CheckoutWorkflowEventPayload {
  fromState: CheckoutState;
  toState: CheckoutState;
  cancellationReason?: CheckoutCancellationReason;
  error?: string;
}

export type CheckoutWorkflowEvent = WorkflowEventEnvelope<CheckoutWorkflowEventPayload>;

export const emittedEvents: CheckoutWorkflowEvent[] = [];

export function clearEmittedEvents(): void {
  emittedEvents.length = 0;
  clearPublishedWorkflowEvents();
}

export function emitCheckoutEvent(event: CheckoutWorkflowEvent): void {
  emittedEvents.push(event);
  publishWorkflowEvent(event);
}

export class CheckoutWorkflow {
  public readonly orderId: string;
  public readonly correlationId: string;
  private _state: CheckoutState = "initiated";
  private _cancellationReason?: CheckoutCancellationReason;

  constructor(orderId: string, correlationId: string = createWorkflowCorrelationId()) {
    this.orderId = orderId;
    this.correlationId = correlationId;
    emitCheckoutEvent(
      createWorkflowEventEnvelope(this.correlationId, this.orderId, "checkout_initiated", {
        fromState: "initiated",
        toState: "initiated",
      })
    );
  }

  public get state(): CheckoutState {
    return this._state;
  }

  public get cancellationReason(): CheckoutCancellationReason | undefined {
    return this._cancellationReason;
  }

  public transitionTo(nextState: CheckoutState, reason?: CheckoutCancellationReason): void {
    const currentState = this._state;

    if (currentState === "completed" || currentState === "cancelled") {
      throw new Error(`Cannot transition from terminal state: ${currentState}`);
    }

    const allowedTransitions: Record<CheckoutState, CheckoutState[]> = {
      initiated: ["pending_approval", "cancelled"],
      pending_approval: ["approved", "cancelled"],
      approved: ["funding", "cancelled"],
      funding: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };

    if (!allowedTransitions[currentState].includes(nextState)) {
      throw new Error(`Invalid state transition from ${currentState} to ${nextState}`);
    }

    if (nextState === "cancelled") {
      if (!reason) {
        throw new Error("Cancellation reason is required for transition to cancelled state");
      }
      const validReasons: CheckoutCancellationReason[] = [
        "user_rejected",
        "approval_timeout",
        "funding_failed",
        "merchant_unavailable",
        "system_error",
      ];
      if (!validReasons.includes(reason)) {
        throw new Error(`Invalid cancellation reason: ${reason}`);
      }
      this._cancellationReason = reason;
    }

    this._state = nextState;

    const eventType = `checkout_${nextState}`;
    emitCheckoutEvent(
      createWorkflowEventEnvelope(this.correlationId, this.orderId, eventType, {
        fromState: currentState,
        toState: nextState,
        ...(reason && { cancellationReason: reason }),
      })
    );
  }
}

export interface CheckoutWorkflowInput {
  orderId: string;
  sourceAddress: string;
  buyerAddress: string;
  sellerAddress: string;
}

export interface CheckoutContext extends Record<string, unknown> {
  orderId: string;
  sourceAddress: string;
  buyerAddress: string;
  sellerAddress: string;
  escrowId: string | null;
  confirmed: boolean;
}

function getPaymentsUrl(): string {
  return process.env.PAYMENTS_URL ?? "http://localhost:3014";
}

interface EscrowOperationResult {
  txHash: string;
  ledger: number;
  success: boolean;
  escrowId?: string;
}

const PAYMENTS_REQUEST_TIMEOUT_MS = Number(process.env.PAYMENTS_REQUEST_TIMEOUT_MS ?? 10_000);

async function callPaymentsService<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${getPaymentsUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PAYMENTS_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reach payments service";
    throw new Error(`Payments service unavailable: ${message}`);
  }

  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || json.error) {
    throw new Error(json.error?.message ?? `Payments service returned status ${response.status}`);
  }
  if (!json.data) {
    throw new Error("Payments service returned an empty response");
  }
  return json.data;
}

/**
 * Deposits the order total into escrow. Compensation refunds the same escrow ID, which is
 * idempotent on the contract side — refunding an already-refunded or never-funded escrow
 * is a no-op rather than a double-spend.
 */
const depositEscrowStep: SagaStep<CheckoutContext> = {
  name: "deposit-escrow",
  async action(context) {
    const result = await callPaymentsService<EscrowOperationResult>("/escrow/deposit", {
      sourceAddress: context.sourceAddress,
      buyerAddress: context.buyerAddress,
      sellerAddress: context.sellerAddress,
      orderId: context.orderId,
    });
    log.info("Escrow deposit confirmed", { orderId: context.orderId, txHash: result.txHash });
    if (!result.escrowId) {
      // Compensation refunds /escrow/${context.escrowId}/refund — falling back to orderId here
      // would point a refund at the wrong resource and leave the real escrow uncompensated.
      throw new Error("Payments service did not return an escrowId for the deposit");
    }
    return { ...context, escrowId: result.escrowId };
  },
  async compensation(context, error) {
    if (!context.escrowId) return context;
    log.warn("Refunding escrow deposit after downstream failure", {
      orderId: context.orderId,
      escrowId: context.escrowId,
      reason: error.message,
    });
    await callPaymentsService<EscrowOperationResult>(`/escrow/${context.escrowId}/refund`, {
      sourceAddress: context.sourceAddress,
    });
    return { ...context, escrowId: null };
  },
};

/**
 * Marks the checkout as confirmed once escrow funds are secured. This is a context-only
 * transition today; once the gateway exposes an order-status endpoint, this step should
 * call it instead so order state stays in sync across services.
 */
const confirmCheckoutStep: SagaStep<CheckoutContext> = {
  name: "confirm-checkout",
  async action(context) {
    return { ...context, confirmed: true };
  },
  async compensation(context) {
    return { ...context, confirmed: false };
  },
};

export function createCheckoutSagaCoordinator(store: SagaStore): SagaCoordinator<CheckoutContext> {
  return new SagaCoordinator<CheckoutContext>({
    steps: [depositEscrowStep, confirmCheckoutStep],
    store,
  });
}

// Issue #210 — Merchant Cancellation Event Handler

export interface MerchantCancellationEvent {
  orderId: string;
  merchantId: string;
  reasonCode: string;
  occurredAt: string;
}

export interface CanceledCheckout {
  orderId: string;
  status: "canceled";
  reason: string;
  canceledAt: string;
  refundNeeded: boolean;
}

export interface RefundNeededEvent {
  orderId: string;
  merchantId: string;
  triggeredAt: string;
}

export interface MerchantCancellationResult {
  checkout: CanceledCheckout;
  refundEvent: RefundNeededEvent | null;
}

/**
 * Handles a merchant cancellation and transitions the checkout workflow to canceled.
 * When escrow is already funded, a refund-needed event is returned for downstream publishing.
 */
export function handleMerchantCancellation(
  event: MerchantCancellationEvent,
  escrowFunded: boolean
): MerchantCancellationResult {
  const checkout: CanceledCheckout = {
    orderId: event.orderId,
    status: "canceled",
    reason: event.reasonCode,
    canceledAt: event.occurredAt,
    refundNeeded: escrowFunded,
  };

  const refundEvent: RefundNeededEvent | null = escrowFunded
    ? {
        orderId: event.orderId,
        merchantId: event.merchantId,
        triggeredAt: event.occurredAt,
      }
    : null;

  return { checkout, refundEvent };
}

export async function checkoutWorkflow(
  input: CheckoutWorkflowInput,
  coordinator: SagaCoordinator<CheckoutContext>,
  sagaId: string
): Promise<SagaRecord<CheckoutContext>> {
  return coordinator.run(sagaId, input.orderId, {
    orderId: input.orderId,
    sourceAddress: input.sourceAddress,
    buyerAddress: input.buyerAddress,
    sellerAddress: input.sellerAddress,
    escrowId: null,
    confirmed: false,
  });
}

