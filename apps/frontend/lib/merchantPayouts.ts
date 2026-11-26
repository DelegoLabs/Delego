import { env } from "./env";
import { createRetryingFetch } from "./api";
import { AssetRevenueBreakdown, Escrow } from "@delegolabs/types";

export interface PayoutRecord {
  id: string;
  escrowId: string;
  orderId?: string;
  amountStroops: string;
  currency: string;
  transactionHash: string;
  ledgerClosedAt: string;
  feeStroops: string;
  assetCode?: string;
}

const retryingFetch = createRetryingFetch();

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

export function getAssetSymbol(assetCode: string): string {
  const upper = assetCode.toUpperCase();
  if (upper === "USDC") return "USDC";
  if (upper === "EURC") return "EURC";
  return "XLM";
}

export function getAssetUsdRate(assetCode: string): number {
  const upper = assetCode.toUpperCase();
  if (upper === "USDC") return 1.0;
  if (upper === "EURC") return 1.08;
  return 0.12;
}

export function normalizeAssetCode(tokenOrAsset?: string): string {
  if (!tokenOrAsset) return "XLM";
  const upper = tokenOrAsset.toUpperCase();
  if (upper.includes("USDC")) return "USDC";
  if (upper.includes("EURC")) return "EURC";
  return "XLM";
}

export function computeAssetRevenueBreakdowns(
  payouts: PayoutRecord[],
  escrows: Escrow[]
): AssetRevenueBreakdown[] {
  const assetCodes = ["USDC", "EURC", "XLM"];
  const stats: Record<string, { settled: bigint; pending: bigint; refunded: bigint }> = {
    USDC: { settled: 0n, pending: 0n, refunded: 0n },
    EURC: { settled: 0n, pending: 0n, refunded: 0n },
    XLM: { settled: 0n, pending: 0n, refunded: 0n },
  };

  for (const p of payouts) {
    const code = normalizeAssetCode(p.assetCode ?? p.currency);
    if (!stats[code]) {
      stats[code] = { settled: 0n, pending: 0n, refunded: 0n };
    }
    const net = BigInt(p.amountStroops) - BigInt(p.feeStroops);
    stats[code].settled += net > 0n ? net : 0n;
  }

  for (const e of escrows) {
    const code = normalizeAssetCode(e.token);
    if (!stats[code]) {
      stats[code] = { settled: 0n, pending: 0n, refunded: 0n };
    }
    const amt = BigInt(e.amount ?? "0");
    const st = (e.status || "").toLowerCase();
    if (st === "funded" || st === "disputed" || st === "cancelling") {
      stats[code].pending += amt;
    } else if (st === "refunded" || st === "cancelled") {
      stats[code].refunded += amt;
    } else if (st === "released") {
      stats[code].settled += amt;
    }
  }

  return assetCodes.map((code) => {
    const data = stats[code];
    const settledStr = data.settled.toString();
    const numUnits = Number(data.settled) / 10_000_000;
    const fiatUsd = numUnits * getAssetUsdRate(code);

    return {
      assetCode: code,
      symbol: getAssetSymbol(code),
      settledVolumeStroops: settledStr,
      pendingEscrowVolumeStroops: data.pending.toString(),
      refundedVolumeStroops: data.refunded.toString(),
      fiatEquivalentUsd: Number(fiatUsd.toFixed(2)),
    };
  });
}
