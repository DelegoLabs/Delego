import type { Order } from "@delegolabs/types";

/**
 * Buyer-facing receipt helpers (order detail page).
 *
 * Orders don't carry a separate "fee" line — `feeStroops` is optional and,
 * when absent, is derived as the gap between `totalStroops` and the sum of
 * line items so the receipt always reconciles even for older orders.
 */

/** Sum of `unitPriceStroops * quantity` across every line item. */
export function receiptSubtotalStroops(order: Order): bigint {
  return order.lineItems.reduce(
    (sum, item) => sum + item.unitPriceStroops * BigInt(item.quantity),
    0n
  );
}

/** Fee portion of `totalStroops`, explicit if set, otherwise derived. */
export function receiptFeeStroops(order: Order): bigint {
  if (order.feeStroops !== undefined) return order.feeStroops;
  const subtotal = receiptSubtotalStroops(order);
  return order.totalStroops > subtotal ? order.totalStroops - subtotal : 0n;
}

export interface ReceiptRecord {
  orderId: string;
  merchantId: string;
  delegationId: string;
  status: string;
  escrowContractId: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: Array<{
    productId: string;
    quantity: number;
    unitPriceStroops: string;
    subtotalStroops: string;
  }>;
  subtotalStroops: string;
  feeStroops: string;
  totalStroops: string;
}

function toIso(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

/** Raw, bookkeeping-friendly record for the "Download JSON" action. */
export function buildReceiptRecord(order: Order): ReceiptRecord {
  return {
    orderId: order.id,
    merchantId: order.merchantId,
    delegationId: order.delegationId,
    status: order.status,
    escrowContractId: order.escrowContractId,
    createdAt: toIso(order.createdAt),
    updatedAt: toIso(order.updatedAt),
    lineItems: order.lineItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPriceStroops: item.unitPriceStroops.toString(),
      subtotalStroops: (item.unitPriceStroops * BigInt(item.quantity)).toString(),
    })),
    subtotalStroops: receiptSubtotalStroops(order).toString(),
    feeStroops: receiptFeeStroops(order).toString(),
    totalStroops: order.totalStroops.toString(),
  };
}

/** Filename for the downloaded receipt JSON, stable per order. */
export function receiptFilename(order: Order): string {
  return `delego-receipt-${order.id}.json`;
}
