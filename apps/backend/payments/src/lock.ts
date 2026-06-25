import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
// @ts-ignore — ioredis-mock is a dev dependency used only in test/mock mode
import MockRedis from "ioredis-mock";
import { createLogger } from "@delego/utils";
import type { EscrowFundingLock } from "./validation.js";

export type { EscrowFundingLock };

const log = createLogger("payments:lock", process.env.LOG_LEVEL ?? "info");

const LOCK_KEY_PREFIX = "escrow:funding:lock:";
const DEFAULT_LOCK_TTL_MS = 30_000;

// Atomic check-and-delete: only removes the key when the stored token matches.
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

export class LockServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockServiceError";
  }
}

let _client: Redis | null = null;

export function getLockRedisClient(): Redis {
  if (!_client) {
    const useMock =
      process.env.NODE_ENV === "test" || process.env.MOCK_REDIS === "true";

    if (useMock) {
      log.info("Using mock Redis for escrow funding lock");
      _client = new MockRedis() as unknown as Redis;
    } else {
      const url = process.env.REDIS_URL;
      _client = url
        ? new Redis(url)
        : new Redis({
            host: process.env.REDIS_HOST ?? "localhost",
            port: Number(process.env.REDIS_PORT ?? 6379),
          });

      _client.on("error", (err: Error) => {
        log.error("Redis connection error in escrow lock", { error: err.message });
      });
    }
  }
  return _client;
}

/**
 * Acquires a Redis SET NX PX distributed lock for the given orderId.
 * Returns the lock on success, or null when another request already holds the lock.
 * Throws LockServiceError when Redis is unreachable.
 */
export async function acquireLock(
  orderId: string
): Promise<EscrowFundingLock | null> {
  const key = `${LOCK_KEY_PREFIX}${orderId}`;
  const lockToken = randomUUID();
  const ttlMs = Number(
    process.env.ESCROW_FUNDING_LOCK_TTL_MS ?? DEFAULT_LOCK_TTL_MS
  );

  let result: string | null;
  try {
    result = await getLockRedisClient().set(key, lockToken, "PX", ttlMs, "NX");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error("Failed to acquire escrow funding lock — Redis unavailable", {
      orderId,
      error: message,
    });
    throw new LockServiceError(`Redis lock service unavailable: ${message}`);
  }

  if (result === null) {
    log.warn("Escrow funding lock already held — duplicate request rejected", {
      orderId,
    });
    return null;
  }

  log.info("Acquired escrow funding lock", { orderId, ttlMs });
  return { orderId, lockToken, createdAt: Date.now() };
}

/**
 * Releases the lock using a Lua script so only the owner (matching lockToken) can delete it.
 * Failures are non-fatal: TTL will expire the key automatically.
 */
export async function releaseLock(
  orderId: string,
  lockToken: string
): Promise<void> {
  const key = `${LOCK_KEY_PREFIX}${orderId}`;
  try {
    const deleted = (await getLockRedisClient().eval(
      RELEASE_SCRIPT,
      1,
      key,
      lockToken
    )) as number;
    if (deleted === 1) {
      log.info("Released escrow funding lock", { orderId });
    } else {
      log.debug(
        "Escrow funding lock not released — token mismatch or already expired",
        { orderId }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.warn(
      "Failed to release escrow funding lock — will expire via TTL",
      { orderId, error: message }
    );
  }
}
