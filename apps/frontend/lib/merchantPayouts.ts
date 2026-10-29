import { env } from "./env";
import { createRetryingFetch } from "./api";
import { AssetRevenueBreakdown } from "@delegolabs/types";

export interface PayoutRecord {
  id: string;
  escrowId: string;
  /** Order the payout settles; older records only carry the escrow id. */
  orderId?: string;
  /** Gross amount released from escrow, before fees. */
  amountStroops: string;
  currency: string;
  transactionHash: string;
  ledgerClosedAt: string;
  feeStroops: string;
  assetCode?: string;
}

export interface EscrowOrderRecord {
  id: string;
  totalStroops?: string | number | bigint;
  amount?: string | number | bigint;
  status?: string;
  currency?: string;
  token?: string;
}

const retryingFetch = createRetryingFetch();

/**
 * Fetches the merchant's completed escrow-release payouts.
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

export function computeAssetRevenueBreakdowns(
  payouts: PayoutRecord[],
  escrowOrders: EscrowOrderRecord[] = []
): AssetRevenueBreakdown[] {
  const supportedAssets = [
    { code: "USDC", symbol: "USDC", usdRate: 1.0 },
    { code: "EURC", symbol: "EURC", usdRate: 1.08 },
    { code: "XLM", symbol: "XLM", usdRate: 0.12 },
  ];

  const stats: Record<string, { settled: bigint; pending: bigint; refunded: bigint; usdRate: number; symbol: string }>
    = {};

  supportedAssets.forEach(a => {
    stats[a.code] = {
      settled: 0n,
      pending: 0n,
      refunded: 0n,
      usdRate: a.usdRate,
      symbol: a.symbol,
    };
  });

  // Aggregate settled payouts
  for (const p of payouts) {
    const code = (p.assetCode || p.currency || "XLM").toUpperCase();
    if (!stats[code]) {
      stats[code] = { settled: 0n, pending: 0n, refunded: 0n, usdRate: 1.0, symbol: code };
    }
    const net = BigInt(p.amountStroops) - BigInt(p.feeStroops);
    stats[code].settled += net > 0n ? net : 0n;
  }

  // Aggregate active/pending/refunded escrows
  for (const o of escrowOrders) {
    const code = (o.token || o.currency || "XLM").toUpperCase();
    if (!stats[code]) {
      stats[code] = { settled: 0n, pending: 0n, refunded: 0n, usdRate: 1.0, symbol: code };
    }
    const rawAmount = o.totalStroops ?? o.amount ?? 0n;
    const amt = typeof rawAmount === "bigint" ? rawAmount : BigInt(rawAmount);
    const status = (o.status || "").toLowerCase();

    if (status === "funded" || status === "escrowed" || status === "pending" || status === "pending_approval") {
      stats[code].pending += amt;
    } else if (status === "refunded") {
      stats[code].refunded += amt;
    } else if (status === "settled" || status === "released" || status === "completed") {
      // if not already in payouts
      stats[code].settled += amt;
    }
  }

  return Object.entries(stats).map(([code, data]) => {
    const settledNum = Number(data.settled) / 10_000_000;
    const fiatEquivalentUsd = Number((settledNum * data.usdRate).toFixed(2));
    return {
      assetCode: code,
      symbol: data.symbol,
      settledVolumeStroops: data.settled.toString(),
      pendingEscrowVolumeStroops: data.pending.toString(),
      refundedVolumeStroops: data.refunded.toString(),
      fiatEquivalentUsd,
    };
  });
}
