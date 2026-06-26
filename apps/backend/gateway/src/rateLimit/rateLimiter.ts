import { getRedisClient } from "./redisClient.js";
import { getRateLimitConfig } from "./config.js";
import type { RateLimitConfig, RateLimitResult } from "./types.js";

function buildKey(
  identifier: string,
  endpoint: string,
  windowMs: number,
): string {
  const windowKey = Math.floor(Date.now() / windowMs);
  return `ratelimit:${identifier}:${endpoint}:${windowKey}`;
}

export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  overrideConfig?: RateLimitConfig,
): Promise<RateLimitResult> {
  const [method = "*", path = "*"] = endpoint.split(":", 2) as [string, string];
  const config = overrideConfig ?? getRateLimitConfig(method, path);

  const { maxRequests, windowMs } = config;
  const key = buildKey(identifier, endpoint, windowMs);

  const redis = config.redisClient ?? getRedisClient();

  const pipeline = redis.multi();
  pipeline.incr(key);
  const results = await pipeline.exec();

  let count = 1;
  if (results?.[0]) {
    const [err, val] = results[0] as [Error | null, number];
    count = err ? 1 : (val as number);
  }

  // Set TTL only on the first increment in this window —
  // removes the need for NX flag which isn't supported by ioredis-mock
  if (count === 1) {
    await redis.expire(key, Math.ceil(windowMs / 1000));
  }

  const allowed = count <= maxRequests;
  const remaining = Math.max(0, maxRequests - count);

  const windowEndMs =
    (Math.floor(Date.now() / windowMs) + 1) * windowMs;
  const resetInSeconds = Math.ceil((windowEndMs - Date.now()) / 1000);

  return {
    allowed,
    limit: maxRequests,
    remaining,
    resetInSeconds,
    identifier,
  };
}
