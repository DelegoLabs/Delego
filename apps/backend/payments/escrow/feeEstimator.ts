import { Horizon } from "@stellar/stellar-sdk";
import { createLogger } from "@delego/utils";

const log = createLogger(
  "payments:fee-estimator",
  process.env.LOG_LEVEL ?? "info",
);

/**
 * Fee estimate from Horizon /fee_stats API
 * Contains statistics about transaction fees on the Stellar network
 */
export interface FeeEstimate {
  source: "horizon" | "fallback";
  baseFeeStroops: number;
  recommendedFeeStroops: number;
  percentile: "p50" | "p95" | "p99";
  fetchedAt: string;
}

/**
 * Raw Horizon fee stats response
 */
interface HorizonFeeStats {
  last_ledger: number;
  last_ledger_base_fee: number;
  ledger_capacity_usage: number;
  fee_charged?: {
    p10: number;
    p20: number;
    p30: number;
    p40: number;
    p50: number;
    p60: number;
    p70: number;
    p80: number;
    p90: number;
    p99: number;
  };
  max_fee?: {
    p10: number;
    p20: number;
    p30: number;
    p40: number;
    p50: number;
    p60: number;
    p70: number;
    p80: number;
    p90: number;
    p99: number;
  };
}

/**
 * Cache entry for fee estimates
 * TTL is configurable but defaults to 30 seconds to balance freshness and network load
 */
interface CacheEntry {
  estimate: FeeEstimate;
  expiresAt: number;
}

/**
 * In-memory cache for fee estimates with TTL
 */
let feeCache: CacheEntry | null = null;

/**
 * Default fallback fee in stroops (0.0001 XLM)
 * Used when Horizon is unavailable or returns malformed data
 * Safe value based on Stellar network minimums
 */
const DEFAULT_FALLBACK_FEE = 100;

/**
 * Cache TTL in milliseconds (30 seconds)
 * Balances between reducing Horizon API load and getting fresh estimates
 */
const CACHE_TTL_MS = 30 * 1000;

/**
 * Validates that the Horizon response has required fee statistics
 */
function isValidFeeStats(stats: unknown): stats is HorizonFeeStats {
  if (typeof stats !== "object" || stats === null) {
    return false;
  }
  const s = stats as Record<string, unknown>;
  const maxFee = s.max_fee as Record<string, unknown> | undefined;

  const result =
    typeof s.last_ledger === "number" &&
    typeof s.last_ledger_base_fee === "number" &&
    typeof s.ledger_capacity_usage === "number" &&
    maxFee !== undefined &&
    maxFee !== null &&
    typeof maxFee.p50 === "number" &&
    typeof maxFee.p95 === "number" &&
    typeof maxFee.p99 === "number";

  return result;
}

/**
 * Internal function that accepts a Horizon server instance for testability
 */
export async function estimateTransactionFeeWithServer(
  horizonServer: Horizon.Server,
  percentile: "p50" | "p95" | "p99" = "p95",
): Promise<FeeEstimate> {
  // Check cache first
  if (feeCache && feeCache.expiresAt > Date.now()) {
    log.debug("Returning cached fee estimate", {
      percentile,
      source: feeCache.estimate.source,
      fee: feeCache.estimate.recommendedFeeStroops,
    });
    return feeCache.estimate;
  }

  try {
    log.debug("Fetching fee estimate from Horizon", { percentile });
    const stats = (await horizonServer.feeStats()) as unknown;

    if (!isValidFeeStats(stats)) {
      log.warn("Horizon returned malformed fee_stats, using fallback", {
        percentile,
        stats,
      });
      return createFallbackEstimate(percentile);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maxFeeData: any = stats.max_fee;
    const recommendedFeeStroops = maxFeeData[percentile] as number;

    // Ensure we never return 0 fees
    const safeFeeStroops = Math.max(
      recommendedFeeStroops,
      DEFAULT_FALLBACK_FEE,
    );

    const estimate: FeeEstimate = {
      source: "horizon",
      baseFeeStroops: stats.last_ledger_base_fee,
      recommendedFeeStroops: safeFeeStroops,
      percentile,
      fetchedAt: new Date().toISOString(),
    };

    // Cache the estimate
    feeCache = {
      estimate,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    log.info("Fee estimate fetched from Horizon", {
      percentile,
      baseFee: stats.last_ledger_base_fee,
      recommendedFee: safeFeeStroops,
      capacityUsage: stats.ledger_capacity_usage,
    });

    return estimate;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("Failed to fetch fee estimate from Horizon, using fallback", {
      error: message,
      percentile,
    });
    return createFallbackEstimate(percentile);
  }
}

/**
 * Estimates transaction fees by querying Horizon's fee_stats endpoint
 * Implements caching to reduce API calls and provides fallback behavior
 *
 * @param horizonUrl - The Horizon server URL to query
 * @param percentile - Fee percentile to use: "p50" (medium), "p95" (high), or "p99" (very high). Defaults to "p95" for reliability.
 * @returns Promise<FeeEstimate> with dynamic fees from Horizon or fallback values
 *
 * @example
 * // Get recommended fee for normal network conditions (p95)
 * const estimate = await estimateTransactionFee("https://horizon-testnet.stellar.org", "p95");
 *
 * @example
 * // Get aggressive fee for congestion (p99)
 * const estimate = await estimateTransactionFee("https://horizon-testnet.stellar.org", "p99");
 */
export async function estimateTransactionFee(
  horizonUrl: string,
  percentile: "p50" | "p95" | "p99" = "p95",
): Promise<FeeEstimate> {
  const horizonServer = new Horizon.Server(horizonUrl);
  return estimateTransactionFeeWithServer(horizonServer, percentile);
}

/**
 * Creates a fallback fee estimate when Horizon is unavailable
 * Used as a safe default to prevent transaction failures during API outages
 *
 * @param percentile - The percentile that was requested
 * @returns FeeEstimate with safe fallback values
 */
function createFallbackEstimate(
  percentile: "p50" | "p95" | "p99",
): FeeEstimate {
  return {
    source: "fallback",
    baseFeeStroops: DEFAULT_FALLBACK_FEE,
    recommendedFeeStroops: DEFAULT_FALLBACK_FEE,
    percentile,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Clears the fee estimate cache
 * Useful for testing or forcing a fresh fetch from Horizon
 */
export function clearFeeCache(): void {
  feeCache = null;
  log.debug("Fee cache cleared");
}

/**
 * Gets the current cached fee estimate without fetching from Horizon
 * Returns null if cache is expired or not set
 *
 * @returns The cached FeeEstimate or null
 */
export function getCachedFeeEstimate(): FeeEstimate | null {
  if (feeCache && feeCache.expiresAt > Date.now()) {
    return feeCache.estimate;
  }
  return null;
}
