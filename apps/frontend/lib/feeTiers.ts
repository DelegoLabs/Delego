import type { FeeTier, FeeTierOption } from "@delegolabs/ui";

/**
 * Live priority-fee quotes from Horizon `/fee_stats`.
 *
 * This is the same percentile feed the payments fee estimator uses: Standard
 * is max-fee p50, Fast is p95, Urgent is p99. Values are floored at the
 * ledger base fee (and at 100 stroops) so a quote never drops below the
 * network minimum. A failed or malformed response falls back to that minimum.
 */

const MINIMUM_FEE_STROOPS = 100;

const TIER_PERCENTILE = {
  standard: "p50",
  fast: "p95",
  urgent: "p99",
} as const;

const TIER_LABEL: Record<FeeTier, string> = {
  standard: "Standard (p50)",
  fast: "Fast (p95)",
  urgent: "Urgent (p99)",
};

/** Rough inclusion time, in seconds, for each priority tier. */
const ESTIMATED_SECONDS: Record<FeeTier, number> = {
  standard: 15,
  fast: 5,
  urgent: 5,
};

const TIERS: readonly FeeTier[] = ["standard", "fast", "urgent"];

export interface FeeTierQuote {
  options: FeeTierOption[];
  source: "horizon" | "fallback";
}

interface PercentileBucket {
  p50?: unknown;
  p90?: unknown;
  p95?: unknown;
  p99?: unknown;
}

interface FeeStatsPayload {
  last_ledger_base_fee?: unknown;
  max_fee?: PercentileBucket;
  fee_charged?: PercentileBucket;
}

export function fallbackFeeTierOptions(): FeeTierOption[] {
  return TIERS.map((tier) => ({
    tier,
    label: TIER_LABEL[tier],
    feeStroops: String(MINIMUM_FEE_STROOPS),
    estimatedSeconds: ESTIMATED_SECONDS[tier],
  }));
}

function asPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function readPercentile(bucket: PercentileBucket | undefined, key: "p50" | "p95" | "p99"): number | null {
  if (!bucket) return null;
  const direct = asPositiveNumber(bucket[key]);
  if (direct != null) return direct;
  // Some Horizon deployments omit p95 and publish p90 instead.
  if (key === "p95") return asPositiveNumber(bucket.p90);
  return null;
}

/**
 * Maps a Horizon `fee_stats` body onto the three selector tiers.
 * Returns null when none of the percentiles can be read.
 */
export function feeTierOptionsFromStats(stats: FeeStatsPayload): FeeTierOption[] | null {
  const floor = Math.max(
    MINIMUM_FEE_STROOPS,
    Math.round(asPositiveNumber(stats.last_ledger_base_fee) ?? MINIMUM_FEE_STROOPS)
  );
  const options = TIERS.map((tier) => {
    const percentile = TIER_PERCENTILE[tier];
    const quoted =
      readPercentile(stats.max_fee, percentile) ??
      readPercentile(stats.fee_charged, percentile);
    if (quoted == null) return null;
    return {
      tier,
      label: TIER_LABEL[tier],
      feeStroops: String(Math.max(floor, Math.round(quoted))),
      estimatedSeconds: ESTIMATED_SECONDS[tier],
    };
  });
  if (options.some((option) => option == null)) return null;
  return options as FeeTierOption[];
}

export async function fetchFeeTierQuote(horizonUrl: string): Promise<FeeTierQuote> {
  const fallback = (): FeeTierQuote => ({
    options: fallbackFeeTierOptions(),
    source: "fallback",
  });

  try {
    const base = horizonUrl.replace(/\/$/, "");
    const response = await fetch(`${base}/fee_stats`);
    if (!response.ok) return fallback();
    const stats = (await response.json()) as FeeStatsPayload;
    const options = feeTierOptionsFromStats(stats);
    if (!options) return fallback();
    return { options, source: "horizon" };
  } catch {
    return fallback();
  }
}
