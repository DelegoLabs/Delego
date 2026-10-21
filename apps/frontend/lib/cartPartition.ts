/**
 * Multi-merchant cart partitioning utilities (#918).
 *
 * When a buyer's cart contains items from more than one merchant, funds
 * cannot be sent into a single monolithic escrow. This module groups the
 * cart into per-merchant partitions and computes independent subtotals so
 * the checkout flow can initiate a separate escrow for each merchant.
 */

import type { CartItem } from "./cart";
import type { AppliedPromoCode, PromoCodeDiscount } from "./promoCode";

export type EscrowStatus =
  | "pending"
  | "authorizing"
  | "confirmed"
  | "failed";

export interface MerchantCartPartition {
  merchantId: string;
  merchantName: string;
  /** Stellar address that will receive the escrowed funds on release */
  payoutAddress: string;
  items: CartItem[];
  /** Merchant subtotal after its validated coupon, in integer Stroops. */
  subtotalStroops: string;
  /** Validated merchant coupon carried to the escrow-signing integration. */
  promoCodeDiscount?: PromoCodeDiscount;
  escrowStatus: EscrowStatus;
}

/**
 * Groups cart items by merchantId into independent partitions.
 * Partition order is stable (first-seen merchantId comes first).
 */
export function partitionCartByMerchant(
  items: CartItem[],
  promoCode?: AppliedPromoCode
): MerchantCartPartition[] {
  const order: string[] = [];
  const map = new Map<string, CartItem[]>();

  for (const item of items) {
    if (!map.has(item.merchantId)) {
      order.push(item.merchantId);
      map.set(item.merchantId, []);
    }
    map.get(item.merchantId)!.push(item);
  }

  return order.map((merchantId) => {
    const partitionItems = map.get(merchantId)!;
    const first = partitionItems[0];
    let subtotal = 0n;
    for (const item of partitionItems) {
      try {
        subtotal += BigInt(item.priceStroops) * BigInt(item.quantity);
      } catch {
        // Malformed priceStroops — skip
      }
    }
    const discount =
      promoCode?.merchantId === merchantId ? promoCode.discount : undefined;
    if (discount) {
      const deduction = BigInt(discount.appliedDiscountStroops);
      if (deduction < 0n || deduction > subtotal) {
        throw new Error("The coupon no longer matches this merchant's order.");
      }
      subtotal -= deduction;
    }
    return {
      merchantId,
      merchantName: first.merchantName,
      payoutAddress: first.payoutAddress,
      items: partitionItems,
      subtotalStroops: subtotal.toString(),
      ...(discount ? { promoCodeDiscount: discount } : {}),
      escrowStatus: "pending",
    };
  });
}

/** Returns the index of the next partition still needing authorization. */
export function nextPendingIndex(
  partitions: MerchantCartPartition[]
): number {
  return partitions.findIndex((p) => p.escrowStatus === "pending");
}

/** True when every partition has been confirmed. */
export function allConfirmed(partitions: MerchantCartPartition[]): boolean {
  return (
    partitions.length > 0 &&
    partitions.every((p) => p.escrowStatus === "confirmed")
  );
}
