/**
 * Redis client singleton for the rate limiter.
 *
 * Uses ioredis for robust Redis interaction including pipelining
 * and MULTI/EXEC support required by the rate limiter.
 * Falls back to ioredis-mock during unit tests.
 */

import { Redis } from "ioredis";
// @ts-ignore
import MockRedis from "ioredis-mock";
import { createLogger } from "@delego/utils";

const log = createLogger("gateway:redis", process.env.LOG_LEVEL ?? "info");

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DEFAULT_REDIS_PING_TIMEOUT_MS = 500;

let redis: Redis | null = null;

export interface RedisHealth {
  status: "ok" | "degraded";
  pingMs?: number;
  error?: string;
}

interface RedisPingClient {
  ping(): Promise<string>;
}

/** Get or create the singleton Redis client */
export function getRedisClient(): Redis {
  if (!redis) {
    const isTest = process.env.NODE_ENV === "test" || process.env.MOCK_REDIS === "true" || Object.keys(process.env).some(k => k.includes('TEST'));
    const useMock = isTest;

    if (useMock) {
      log.info("Using mock Redis connection for rate limiting");
      const MockRedisConstructor = MockRedis as any;
      redis = new MockRedisConstructor();
    } else {
      log.info("Connecting to real Redis for rate limiting", { url: REDIS_URL });
      redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times: number): number | null {
          if (times > 5) {
            log.error("Redis connection failed after 5 retries — giving up");
            return null; // stop retrying
          }
          return Math.min(times * 200, 2000);
        },
        lazyConnect: false,
      });

      redis.on("connect", () => log.info("Redis connected", { url: REDIS_URL }));
      redis.on("error", (err: any) =>
        log.error("Redis error", { error: err.message })
      );
    }
  }
  return redis!;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function pingWithTimeout(
  client: RedisPingClient,
  timeoutMs: number,
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Redis ping timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

/**
 * Ping the rate-limiter Redis client and report health without throwing.
 *
 * The timeout keeps gateway health checks bounded when Redis is slow or
 * unavailable. Tests can pass a client stub to exercise success/failure paths
 * without mutating the singleton used by the rate limiter.
 */
export async function getRedisHealth(
  client: RedisPingClient = getRedisClient(),
  timeoutMs = DEFAULT_REDIS_PING_TIMEOUT_MS,
): Promise<RedisHealth> {
  const start = Date.now();

  try {
    await pingWithTimeout(client, timeoutMs);
    return {
      status: "ok",
      pingMs: Date.now() - start,
    };
  } catch (err) {
    return {
      status: "degraded",
      error: errorMessage(err),
    };
  }
}

/** Gracefully close the Redis connection */
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    log.info("Redis disconnected");
  }
}
