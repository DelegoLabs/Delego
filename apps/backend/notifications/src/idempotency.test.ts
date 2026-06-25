import { describe, it, expect, vi } from "vitest";
import { deriveDispatchKey, checkAndMarkDispatched } from "./idempotency.js";
import type { NotificationDispatchKey } from "./idempotency.js";
import type { Redis } from "ioredis";

const key: NotificationDispatchKey = {
  userId: "user-1",
  channel: "email",
  eventType: "transaction_approval",
  eventId: "evt-abc",
};

describe("deriveDispatchKey", () => {
  it("produces a stable key from event metadata", () => {
    const result = deriveDispatchKey(key);
    expect(result).toBe(
      "dispatch:idempotency:user-1:email:transaction_approval:evt-abc"
    );
  });

  it("distinguishes push from email channel", () => {
    const pushKey = deriveDispatchKey({ ...key, channel: "push" });
    const emailKey = deriveDispatchKey({ ...key, channel: "email" });
    expect(pushKey).not.toBe(emailKey);
  });
});

describe("checkAndMarkDispatched", () => {
  it("returns true on first dispatch attempt", async () => {
    const redis = { set: vi.fn().mockResolvedValue("OK") } as unknown as Redis;
    const result = await checkAndMarkDispatched(redis, key);
    expect(result).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      "dispatch:idempotency:user-1:email:transaction_approval:evt-abc",
      "1",
      "EX",
      86400,
      "NX"
    );
  });

  it("returns false on repeated dispatch attempt (duplicate)", async () => {
    const redis = { set: vi.fn().mockResolvedValue(null) } as unknown as Redis;
    const result = await checkAndMarkDispatched(redis, key);
    expect(result).toBe(false);
  });
});
