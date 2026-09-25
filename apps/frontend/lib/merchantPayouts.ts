import { env } from "./env";
import { createRetryingFetch } from "./api";

export interface PayoutRecord {
  id: string;
  escrowId: string;
  amountStroops: string;
  currency: string;
  transactionHash: string;
  ledgerClosedAt: string;
  feeStroops: string;
}

const retryingFetch = createRetryingFetch();

/**
 * Fetches the merchant's completed escrow-release payouts. There is no
 * `listMerchantPayouts` method on `@delegolabs/sdk` yet, so this calls the
 * REST endpoint directly (see `submitShipment` in `lib/shipments.ts` for the
 * same pattern and its auth caveat).
 */
export async function fetchMerchantPayouts(): Promise<PayoutRecord[]> {
  const res = await retryingFetch(`${env.NEXT_PUBLIC_API_URL}/merchant/payouts`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Failed to load payout history (${res.status}).`);
  }
  const json = (await res.json()) as { payouts?: PayoutRecord[] };
  return json.payouts ?? [];
}

/** Sum of `amountStroops` minus `feeStroops` across all payouts, as a bigint. */
export function totalNetEarningsStroops(payouts: PayoutRecord[]): bigint {
  return payouts.reduce(
    (sum, p) => sum + (BigInt(p.amountStroops) - BigInt(p.feeStroops)),
    0n
  );
}

export function stroopsToDisplay(stroops: bigint | string): string {
  const value = typeof stroops === "string" ? BigInt(stroops) : stroops;
  return (Number(value) / 10_000_000).toLocaleString(undefined, { maximumFractionDigits: 7 });
}
