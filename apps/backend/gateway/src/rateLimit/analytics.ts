/**
 * #340 — Rate limit analytics.
 *
 * Reads raw hit/throttle counters written into Redis by the rate limiter and
 * aggregates them into a summary suitable for the admin dashboard.
 *
 * Key schema (written by rateLimiter.ts):
 *   ratelimit:{identifier}:{METHOD:path}:{windowKey}   → hit count (integer)
 *
 * An additional throttle counter is written here when a request is rejected:
 *   ratelimit:throttle:{METHOD:path}:{windowKey}       → throttle count (integer)
 */

import { getRedisClient } from "./redisClient.js";
import { createLogger } from "@delego/utils";

const log = createLogger("gateway:rateLimit:analytics", process.env.LOG_LEVEL ?? "info");

/** Maximum number of keys scanned per SCAN call (tune for Redis cluster size). */
const SCAN_COUNT = 200;

export interface EndpointMetric {
  /** e.g. "POST:/api/v1/auth/login" */
  endpoint: string;
  /** Total requests observed in the current analytics window. */
  requestCount: number;
  /** Total requests that were throttled (HTTP 429) in the current window. */
  throttleCount: number;
}

export interface UserMetric {
  /** User ID or IP address used as the rate-limit identifier. */
  identifier: string;
  /** Total requests attributed to this identifier. */
  requestCount: number;
}

export interface RateLimitAnalyticsSummary {
  /** Per-endpoint aggregated counters. */
  endpoints: EndpointMetric[];
  /** Top-N users/IPs sorted by request volume (descending). */
  topUsers: UserMetric[];
  /** Unix timestamp (ms) when this snapshot was generated. */
  generatedAt: number;
}

/**
 * Scans all `ratelimit:*` keys in Redis and aggregates them into an analytics
 * summary covering the currently active sliding windows.
 *
 * @param topN   How many top users to include (default: 10).
 * @param redis  Optionally inject a Redis client (useful in tests).
 */
export async function aggregateRateLimitAnalytics(
  topN = 10,
  redis = getRedisClient(),
): Promise<RateLimitAnalyticsSummary> {
  // ── 1. Collect all matching keys ──────────────────────────────────────────
  const allKeys: string[] = [];
  let cursor = "0";

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      "ratelimit:*",
      "COUNT",
      SCAN_COUNT,
    );
    cursor = nextCursor;
    allKeys.push(...keys);
  } while (cursor !== "0");

  if (allKeys.length === 0) {
    return { endpoints: [], topUsers: [], generatedAt: Date.now() };
  }

  // ── 2. Fetch all values in a single pipeline ──────────────────────────────
  const pipeline = redis.multi();
  for (const key of allKeys) {
    pipeline.get(key);
  }
  const results = await pipeline.exec();

  // ── 3. Aggregate by endpoint and by identifier ────────────────────────────
  /**
   * Key formats:
   *   ratelimit:{identifier}:{endpoint}:{windowKey}   — hit counter
   *   ratelimit:throttle:{endpoint}:{windowKey}       — throttle counter
   */
  const endpointRequests = new Map<string, number>();
  const endpointThrottles = new Map<string, number>();
  const userRequests = new Map<string, number>();

  for (let i = 0; i < allKeys.length; i++) {
    const key = allKeys[i];
    const [err, raw] = (results?.[i] ?? [null, null]) as [Error | null, string | null];
    if (err || raw === null) continue;

    const count = parseInt(raw, 10);
    if (!Number.isFinite(count)) continue;

    // Strip the leading "ratelimit:" prefix, then split
    const withoutPrefix = key.slice("ratelimit:".length);
    const parts = withoutPrefix.split(":");

    if (parts[0] === "throttle") {
      // ratelimit:throttle:{METHOD}:{path}:{windowKey}
      // We reconstruct "METHOD:path" from parts[1..n-1] (last part is windowKey)
      if (parts.length >= 4) {
        const endpoint = parts.slice(1, parts.length - 1).join(":");
        endpointThrottles.set(endpoint, (endpointThrottles.get(endpoint) ?? 0) + count);
      }
    } else {
      // ratelimit:{identifier}:{METHOD}:{path}:{windowKey}
      if (parts.length >= 4) {
        const identifier = parts[0];
        const endpoint = parts.slice(1, parts.length - 1).join(":");
        endpointRequests.set(endpoint, (endpointRequests.get(endpoint) ?? 0) + count);
        userRequests.set(identifier, (userRequests.get(identifier) ?? 0) + count);
      }
    }
  }

  // ── 4. Build output ───────────────────────────────────────────────────────
  const endpoints: EndpointMetric[] = Array.from(
    new Set([...endpointRequests.keys(), ...endpointThrottles.keys()]),
  ).map((endpoint) => ({
    endpoint,
    requestCount: endpointRequests.get(endpoint) ?? 0,
    throttleCount: endpointThrottles.get(endpoint) ?? 0,
  }));

  // Sort by requestCount desc so the busiest endpoints appear first
  endpoints.sort((a, b) => b.requestCount - a.requestCount);

  const topUsers: UserMetric[] = Array.from(userRequests.entries())
    .map(([identifier, requestCount]) => ({ identifier, requestCount }))
    .sort((a, b) => b.requestCount - a.requestCount)
    .slice(0, topN);

  log.debug("Rate limit analytics aggregated", {
    keyCount: allKeys.length,
    endpointCount: endpoints.length,
    topUserCount: topUsers.length,
  });

  return { endpoints, topUsers, generatedAt: Date.now() };
}

/**
 * Records a throttle event for an endpoint.
 * Called by the rate limit middleware whenever it returns HTTP 429.
 *
 * @param endpoint  e.g. "POST:/api/v1/auth/login"
 * @param windowMs  Window duration (ms) — used to compute the TTL.
 * @param redis     Optionally inject a Redis client.
 */
export async function recordThrottle(
  endpoint: string,
  windowMs: number,
  redis = getRedisClient(),
): Promise<void> {
  try {
    const windowKey = Math.floor(Date.now() / windowMs);
    const key = `ratelimit:throttle:${endpoint}:${windowKey}`;
    const pipeline = redis.multi();
    pipeline.incr(key);
    await pipeline.exec();
    await redis.expire(key, Math.ceil(windowMs / 1000));
  } catch (err) {
    log.warn("Failed to record throttle event", {
      endpoint,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
