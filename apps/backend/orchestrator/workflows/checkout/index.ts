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

export interface CheckoutWorkflowEvent {
  type:
    | "checkout_initiated"
    | "checkout_pending_approval"
    | "checkout_approved"
    | "checkout_funding"
    | "checkout_completed"
    | "checkout_cancelled";
  orderId: string;
  timestamp: string;
  payload: {
    fromState: CheckoutState;
    toState: CheckoutState;
    cancellationReason?: CheckoutCancellationReason;
    error?: string;
  };
}

export const emittedEvents: CheckoutWorkflowEvent[] = [];

export function clearEmittedEvents(): void {
  emittedEvents.length = 0;
}

export function emitCheckoutEvent(event: CheckoutWorkflowEvent): void {
  emittedEvents.push(event);
}

export class CheckoutWorkflow {
  public readonly orderId: string;
  private _state: CheckoutState = "initiated";
  private _cancellationReason?: CheckoutCancellationReason;

  constructor(orderId: string) {
    this.orderId = orderId;
    emitCheckoutEvent({
      type: "checkout_initiated",
      orderId: this.orderId,
      timestamp: new Date().toISOString(),
      payload: {
        fromState: "initiated",
        toState: "initiated",
      },
    });
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

    const eventType = `checkout_${nextState}` as CheckoutWorkflowEvent["type"];
    emitCheckoutEvent({
      type: eventType,
      orderId: this.orderId,
      timestamp: new Date().toISOString(),
      payload: {
        fromState: currentState,
        toState: nextState,
        ...(reason && { cancellationReason: reason }),
      },
    });
  }
}

/** Checkout workflow — TODO: Coordinate with payments service and user approval */
export interface CheckoutWorkflowInput {
  orderId: string;
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
  _input: CheckoutWorkflowInput
): Promise<{ status: "pending" }> {
  return { status: "pending" };
}

