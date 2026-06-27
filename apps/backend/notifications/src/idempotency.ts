import type { Redis } from "ioredis";

// Issue #213
export interface NotificationDispatchKey {
  userId: string;
  channel: "email" | "push";
  eventType: string;
  eventId: string;
}

const IDEMPOTENCY_NS = "dispatch:idempotency";
const IDEMPOTENCY_TTL_SECONDS = 86_400; // 24 hours

export function deriveDispatchKey(key: NotificationDispatchKey): string {
  return `${IDEMPOTENCY_NS}:${key.userId}:${key.channel}:${key.eventType}:${key.eventId}`;
}

/**
 * Returns true if this is the first dispatch attempt (proceed), false if duplicate (skip).
 * Uses SET NX so concurrent workers can't both claim the same key.
 */
export async function checkAndMarkDispatched(
  redis: Redis,
  key: NotificationDispatchKey
): Promise<boolean> {
  const redisKey = deriveDispatchKey(key);
  const result = await redis.set(redisKey, "1", "EX", IDEMPOTENCY_TTL_SECONDS, "NX");
  return result === "OK";
}
