import type { Order } from "@delego/types";

export interface PurchaseWorkflowInput {
  delegationId: string;
  productId: string;
  quantity: number;
}

export interface PurchaseWorkflowState {
  step: "init" | "catalog" | "approval" | "escrow" | "complete" | "payment_timeout";
  orderId: string | null;
}

// Issue #208 — Payment Timeout Transition Handler

export interface PaymentTimeoutEvent {
  orderId: string;
  timeoutAt: string;
  reason: "escrow_funding_timeout";
}

export interface CancellationEvent {
  orderId: string;
  reason: "payment_timeout";
  occurredAt: string;
}

/**
 * Transitions a purchase workflow to payment_timeout when escrow funding does not
 * complete in time. Returns a CancellationEvent for downstream consumption.
 */
export function handlePaymentTimeout(event: PaymentTimeoutEvent): CancellationEvent {
  return {
    orderId: event.orderId,
    reason: "payment_timeout",
    occurredAt: new Date().toISOString(),
  };
}

// Issue #209 — Delivery Proof Validation Adapter

export interface DeliveryProofValidation {
  orderId: string;
  proofId: string;
  valid: boolean;
  reason?: string;
}

export interface DeliveryProofAdapter {
  validate(orderId: string, proofId: string): Promise<DeliveryProofValidation>;
}

/** Stub adapter — replace with a real delivery verification service. */
export const defaultDeliveryProofAdapter: DeliveryProofAdapter = {
  async validate(orderId, proofId) {
    return { orderId, proofId, valid: false, reason: "adapter_not_configured" };
  },
};

export class DeliveryProofInvalidError extends Error {
  constructor(public readonly validation: DeliveryProofValidation) {
    super(
      `Delivery proof invalid for order ${validation.orderId}: ${validation.reason ?? "unknown"}`
    );
    this.name = "DeliveryProofInvalidError";
  }
}

/**
 * Validates delivery proof before settlement is requested.
 * Throws DeliveryProofInvalidError to block the settlement transition when proof is invalid.
 */
export async function validateDeliveryProof(
  orderId: string,
  proofId: string,
  adapter: DeliveryProofAdapter = defaultDeliveryProofAdapter
): Promise<DeliveryProofValidation> {
  const result = await adapter.validate(orderId, proofId);
  if (!result.valid) {
    throw new DeliveryProofInvalidError(result);
  }
  return result;
}

/**
 * Purchase workflow orchestration.
 * TODO: Implement state machine with persistence (PostgreSQL + Redis)
 */
export async function purchaseWorkflow(
  _input: PurchaseWorkflowInput
): Promise<{ state: PurchaseWorkflowState; order: Order | null }> {
  return {
    state: { step: "init", orderId: null },
    order: null,
  };
}
