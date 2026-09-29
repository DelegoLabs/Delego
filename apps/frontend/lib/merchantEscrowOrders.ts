import { env } from "./env";
import { createRetryingFetch } from "./api";

export interface MerchantEscrowOrder {
  orderId: string;
  escrowId: string;
  buyerAddress: string;
  amountStroops: string;
  currency: string;
  status: "funded" | "shipped" | "delivered" | "released";
  shippingAddress: string;
  fundedAt: string;
  deadline: string;
}

const retryingFetch = createRetryingFetch();

/**
 * Fetches the current merchant's incoming orders with funded escrows. There
 * is no `listMerchantOrders` method on `@delegolabs/sdk` yet, so this calls
 * the REST endpoint directly (see `submitShipment` in `lib/shipments.ts` for
 * the same pattern and its auth caveat).
 */
export async function fetchMerchantEscrowOrders(): Promise<MerchantEscrowOrder[]> {
  const res = await retryingFetch(`${env.NEXT_PUBLIC_API_URL}/merchant/orders`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Failed to load merchant orders (${res.status}).`);
  }
  const json = (await res.json()) as { orders?: MerchantEscrowOrder[] };
  return json.orders ?? [];
}

/** Milliseconds remaining until `deadline`. Negative once past due. */
export function msUntilDeadline(deadline: string, now: Date): number {
  return new Date(deadline).getTime() - now.getTime();
}

export type DeadlineUrgency = "normal" | "amber" | "red";

/** Amber inside 24h of the deadline, red inside 4h (or already past due). */
export function deadlineUrgency(deadline: string, now: Date): DeadlineUrgency {
  const msLeft = msUntilDeadline(deadline, now);
  if (msLeft <= 4 * 60 * 60 * 1000) return "red";
  if (msLeft <= 24 * 60 * 60 * 1000) return "amber";
  return "normal";
}

export interface PayoutProjection {
  pendingGrossStroops: bigint;
  estimatedPlatformFees: bigint;
  projectedNetPayout: bigint;
}

export const PLATFORM_FEE_BPS = 100n;

export function computePayoutProjections(orders: MerchantEscrowOrder[]): PayoutProjection {
  const activeOrders = orders.filter((o) => o.status !== "released");
  const pendingGrossStroops = activeOrders.reduce((sum, o) => sum + BigInt(o.amountStroops), 0n);
  const estimatedPlatformFees = (pendingGrossStroops * PLATFORM_FEE_BPS) / 10000n;
  const projectedNetPayout = pendingGrossStroops - estimatedPlatformFees;
  return { pendingGrossStroops, estimatedPlatformFees, projectedNetPayout };
}

