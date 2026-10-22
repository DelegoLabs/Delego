/**
 * Gas fee surge detection (#1002).
 *
 * Stellar's base fee sits at 100 stroops when the network is quiet. During
 * congestion the ledger raises it and Horizon's published priority-fee
 * percentiles move with it — the same transaction that cost 100 stroops a
 * minute ago can cost tens of thousands a minute later.
 *
 * This module turns Horizon's fee-stats feed into the four numbers the UI
 * needs before a user signs anything:
 *
 *  - `baseFeeStroops`            the ledger's current base fee
 *  - `recommendedFeeStroops`     the recommended priority fee (the p95 max fee)
 *  - `isSurgeActive`             whether the network is congested right now
 *  - `userConfiguredMaxFeeStroops` the user's own comfort limit
 *
 * The detection rules are pure and synchronous so they can be unit-tested
 * without a network; only `fetchGasFeeEstimate` talks to Horizon.
 *
 * Horizon publishes the feed at `/fee_stats` (the issue brief spells it
 * `/fee-stats`; the underscored path is the one the public endpoints serve).
 */
import {
  MINIMUM_FEE_STROOPS,
  readFeePercentile,
  type HorizonFeeStats,
} from "./feeTiers";

/**
 * The estimate the surge warning is built from.
 *
 * Every monetary value is a decimal string of stroops — the same convention
 * the rest of the app uses for amounts that must survive JSON round-trips
 * without losing precision.
 */
export interface GasFeeEstimate {
  /** The ledger's current base fee, in stroops. */
  baseFeeStroops: string;
  /** The recommended priority fee for a transaction right now, in stroops. */
  recommendedFeeStroops: string;
  /** True while the network is congested and fees are above their normal band. */
  isSurgeActive: boolean;
  /** The user's configured max-fee comfort limit, in stroops. */
  userConfiguredMaxFeeStroops: string;
}

/**
 * How many times the protocol-minimum base fee a transaction may cost before
 * we call the network congested. 10x the 100-stroop minimum is the point
 * where a routine payment starts costing noticeably more than usual.
 */
export const SURGE_BASE_FEE_MULTIPLIER = 10;

/**
 * The fee (in stroops) at which the network counts as congested. Derived from
 * the protocol minimum so it tracks the network rather than a magic number.
 */
export const SURGE_FEE_THRESHOLD_STROOPS =
  MINIMUM_FEE_STROOPS * SURGE_BASE_FEE_MULTIPLIER;

/**
 * Default comfort limit: 100,000 stroops (0.01 XLM). A quiet network charges
 * a few hundred stroops for a transfer, so this only trips once fees have
 * genuinely spiked — which is exactly when the user should be asked.
 */
export const DEFAULT_MAX_FEE_CAP_STROOPS = "100000";

/** The percentile Horizon quotes as the recommended fee. Matches the "Fast" tier. */
export const RECOMMENDED_FEE_PERCENTILE = "p95" as const;

/**
 * How long to wait for Horizon's fee-stats feed before giving up and using
 * the fallback estimate. Bounded so a hanging endpoint can't stall the
 * transaction flow.
 */
export const DEFAULT_FEE_STATS_TIMEOUT_MS = 5000;

/** Where a fee estimate came from — live Horizon data or the safe fallback. */
export type FeeEstimateSource = "horizon" | "fallback";

export interface GasFeeEstimateResult {
  estimate: GasFeeEstimate;
  source: FeeEstimateSource;
}

/**
 * Parses a stroop amount into a bigint. Accepts the string form the API
 * speaks as well as numbers, and rejects anything that is not a
 * non-negative integer — a malformed fee must never be treated as zero.
 */
export function parseStroops(
  value: string | number | bigint | null | undefined
): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value >= 0n ? value : null;
  const text = typeof value === "number" ? String(value) : value.trim();
  if (!/^\d+$/.test(text)) return null;
  try {
    const parsed = BigInt(text);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}

/** Normalizes a stroop amount to its canonical decimal string, or null. */
export function normalizeStroops(
  value: string | number | bigint | null | undefined
): string | null {
  const parsed = parseStroops(value);
  return parsed === null ? null : parsed.toString();
}

/**
 * Whether the fee the user would pay has left the normal band.
 *
 * The recommended fee is floored at the ledger base fee, so a base-fee surge
 * always implies a recommended-fee surge — one comparison covers both.
 */
export function isSurgeFee(recommendedFeeStroops: string): boolean {
  const recommended = parseStroops(recommendedFeeStroops);
  if (recommended === null) return false;
  return recommended >= BigInt(SURGE_FEE_THRESHOLD_STROOPS);
}

/**
 * Whether a concrete fee amount breaches the user's configured limit.
 * Used for both the network's recommended fee and the fee a specific
 * transaction was built with.
 */
export function exceedsMaxFeeCap(
  feeStroops: string,
  maxFeeStroops: string
): boolean {
  const fee = parseStroops(feeStroops);
  const cap = parseStroops(maxFeeStroops);
  if (fee === null || cap === null) return false;
  return fee > cap;
}

/**
 * Builds a `GasFeeEstimate` from already-resolved numbers, normalizing the
 * stroop strings and deriving the surge flag.
 */
export function buildGasFeeEstimate(input: {
  baseFeeStroops: string;
  recommendedFeeStroops: string;
  userConfiguredMaxFeeStroops: string;
}): GasFeeEstimate {
  const baseFeeStroops =
    normalizeStroops(input.baseFeeStroops) ?? String(MINIMUM_FEE_STROOPS);
  const recommendedFeeStroops =
    normalizeStroops(input.recommendedFeeStroops) ?? baseFeeStroops;
  const userConfiguredMaxFeeStroops =
    normalizeStroops(input.userConfiguredMaxFeeStroops) ??
    DEFAULT_MAX_FEE_CAP_STROOPS;

  return {
    baseFeeStroops,
    recommendedFeeStroops,
    isSurgeActive: isSurgeFee(recommendedFeeStroops),
    userConfiguredMaxFeeStroops,
  };
}

/**
 * Reads the ledger base fee out of a Horizon fee-stats body. Falls back to
 * the protocol minimum when the field is missing or unreadable.
 */
export function baseFeeFromStats(stats: HorizonFeeStats): string {
  const raw = stats.last_ledger_base_fee;
  const parsed =
    typeof raw === "number" || typeof raw === "string"
      ? parseStroops(raw)
      : null;
  return String(parsed ?? MINIMUM_FEE_STROOPS);
}

/**
 * Reads the recommended priority fee out of a Horizon fee-stats body.
 *
 * The p95 max fee is the recommended quote (the same percentile the "Fast"
 * tier offers). When Horizon doesn't publish it we step down to p90 and p50,
 * and to the `fee_charged` bucket, before giving up. The result is never
 * below the ledger base fee — you cannot pay less than the network asks.
 */
export function recommendedFeeFromStats(stats: HorizonFeeStats): string | null {
  const baseFee =
    parseStroops(baseFeeFromStats(stats)) ?? BigInt(MINIMUM_FEE_STROOPS);
  const candidates: Array<"p95" | "p90" | "p50"> = [
    RECOMMENDED_FEE_PERCENTILE,
    "p90",
    "p50",
  ];
  for (const bucket of [stats.max_fee, stats.fee_charged]) {
    for (const percentile of candidates) {
      const quoted = readFeePercentile(bucket, percentile);
      if (quoted === null) continue;
      const rounded = BigInt(Math.round(quoted));
      return String(rounded > baseFee ? rounded : baseFee);
    }
  }
  return null;
}

/**
 * Builds a `GasFeeEstimate` from a Horizon fee-stats body.
 *
 * When the body carries no usable fee data the estimate falls back to the
 * protocol minimum and reports no surge: we never claim congestion we cannot
 * see, and we never block a transaction on a guess.
 */
export function detectFeeSurge(
  stats: HorizonFeeStats,
  userConfiguredMaxFeeStroops: string
): GasFeeEstimate {
  const baseFeeStroops = baseFeeFromStats(stats);
  const recommendedFeeStroops = recommendedFeeFromStats(stats) ?? baseFeeStroops;
  return buildGasFeeEstimate({
    baseFeeStroops,
    recommendedFeeStroops,
    userConfiguredMaxFeeStroops,
  });
}

/**
 * Whether the recommended network fee is above the user's configured limit —
 * the condition that triggers the surge warning.
 */
export function isFeeAboveUserLimit(estimate: GasFeeEstimate): boolean {
  return exceedsMaxFeeCap(
    estimate.recommendedFeeStroops,
    estimate.userConfiguredMaxFeeStroops
  );
}

/**
 * How many times the recommended fee costs compared with the ledger base
 * fee. `null` when the base fee is zero (no meaningful ratio to show).
 */
export function feeSurgeRatio(estimate: GasFeeEstimate): number | null {
  const base = parseStroops(estimate.baseFeeStroops);
  const recommended = parseStroops(estimate.recommendedFeeStroops);
  if (base === null || recommended === null || base === 0n) return null;
  return Number(recommended) / Number(base);
}

/**
 * Fetches the live fee estimate from Horizon.
 *
 * Never throws: a Horizon outage falls back to the protocol minimum and
 * reports `source: "fallback"`, so a flaky stats endpoint can never stop a
 * user from signing. The request is bounded by a timeout so a hanging
 * endpoint can't stall the caller indefinitely.
 */
export async function fetchGasFeeEstimate(
  horizonUrl: string,
  userConfiguredMaxFeeStroops: string,
  options?: { timeoutMs?: number }
): Promise<GasFeeEstimateResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_FEE_STATS_TIMEOUT_MS;
  const fallback = (): GasFeeEstimateResult => ({
    estimate: buildGasFeeEstimate({
      baseFeeStroops: String(MINIMUM_FEE_STROOPS),
      recommendedFeeStroops: String(MINIMUM_FEE_STROOPS),
      userConfiguredMaxFeeStroops,
    }),
    source: "fallback",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const base = horizonUrl.replace(/\/$/, "");
    const response = await fetch(`${base}/fee_stats`, {
      signal: controller.signal,
    });
    if (!response.ok) return fallback();
    const stats = (await response.json()) as HorizonFeeStats;
    return {
      estimate: detectFeeSurge(stats, userConfiguredMaxFeeStroops),
      source: "horizon",
    };
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}
