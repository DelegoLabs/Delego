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
  return (order.lineItems ?? []).reduce(
    (sum, item) => sum + BigInt(item.unitPriceStroops ?? 0) * BigInt(item.quantity),
    0n
  );
}

export function receiptFeeStroops(order: Order): bigint {
  const subtotal = receiptSubtotalStroops(order);
  const total = order.totalStroops ?? 0n;
  return total > subtotal ? BigInt(total) - subtotal : 0n;
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

export function buildReceiptRecord(order: Order): ReceiptRecord {
  return {
    orderId: order.id,
    merchantId: order.merchantId ?? "",
    delegationId: order.delegationId ?? "",
    status: order.status as any,
    escrowContractId: (order as any).escrowContractId ?? null,
    createdAt: toIso(order.createdAt ?? new Date()),
    updatedAt: toIso(order.updatedAt ?? new Date()),
    lineItems: (order.lineItems ?? []).map((item) => {
      const up = item.unitPriceStroops ?? 0n;
      return {
        productId: item.productId ?? "",
        quantity: item.quantity,
        unitPriceStroops: up.toString(),
        subtotalStroops: (BigInt(up) * BigInt(item.quantity)).toString(),
      };
    }),
    subtotalStroops: receiptSubtotalStroops(order).toString(),
    feeStroops: receiptFeeStroops(order).toString(),
    totalStroops: (order.totalStroops ?? 0n).toString(),
  };
}

/** Filename for the downloaded receipt JSON, stable per order. */
export function receiptFilename(order: Order): string {
  return `delego-receipt-${order.id}.json`;
}
