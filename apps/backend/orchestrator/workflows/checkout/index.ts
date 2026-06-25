/** Checkout workflow — TODO: Implement payment confirmation flow */
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
  // TODO: Coordinate with payments service and user approval
  return { status: "pending" };
}
