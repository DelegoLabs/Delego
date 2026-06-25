import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  acquireLock,
  releaseLock,
  getLockRedisClient,
} from "../../../apps/backend/payments/dist/src/lock.js";

describe("EscrowFundingLock", () => {
  before(() => {
    process.env.NODE_ENV = "test";
    process.env.MOCK_REDIS = "true";
  });

  beforeEach(async () => {
    const redis = getLockRedisClient();
    await redis.flushall();
  });

  it("acquires lock when orderId has no active funding request", async () => {
    const lock = await acquireLock("order-001");

    assert.ok(lock !== null, "should acquire lock on first attempt");
    assert.equal(lock.orderId, "order-001");
    assert.ok(
      typeof lock.lockToken === "string" && lock.lockToken.length > 0,
      "lockToken must be a non-empty string"
    );
    assert.ok(
      typeof lock.createdAt === "number" && lock.createdAt > 0,
      "createdAt must be a positive timestamp"
    );
  });

  it("blocks a second concurrent lock request on the same orderId", async () => {
    const lock1 = await acquireLock("order-concurrent");
    assert.ok(lock1 !== null, "first attempt should acquire lock");

    const lock2 = await acquireLock("order-concurrent");
    assert.equal(lock2, null, "second concurrent attempt must be blocked");
  });

  it("allows different orderIds to acquire locks independently", async () => {
    const lockA = await acquireLock("order-A");
    const lockB = await acquireLock("order-B");

    assert.ok(lockA !== null, "order-A should acquire its own lock");
    assert.ok(lockB !== null, "order-B should acquire its own lock independently");
  });

  it("releases lock cleanly so next request can proceed", async () => {
    const lock = await acquireLock("order-release");
    assert.ok(lock !== null, "initial acquire should succeed");

    await releaseLock(lock.orderId, lock.lockToken);

    const lockAfter = await acquireLock("order-release");
    assert.ok(lockAfter !== null, "should re-acquire lock after clean release");
  });

  it("does not release a lock owned by a different token", async () => {
    const lock = await acquireLock("order-wrong-token");
    assert.ok(lock !== null);

    await releaseLock("order-wrong-token", "not-the-real-token");

    // Lock should still be held because the wrong token was provided
    const attempt = await acquireLock("order-wrong-token");
    assert.equal(
      attempt,
      null,
      "lock must still be held after wrong-token release attempt"
    );
  });

  it("lock expires automatically after TTL allowing reacquisition", async () => {
    const originalTtl = process.env.ESCROW_FUNDING_LOCK_TTL_MS;
    process.env.ESCROW_FUNDING_LOCK_TTL_MS = "100"; // 100 ms for this test

    try {
      const lock = await acquireLock("order-ttl");
      assert.ok(lock !== null, "initial acquire should succeed");

      // Confirm lock blocks a second attempt before expiry
      const blocked = await acquireLock("order-ttl");
      assert.equal(blocked, null, "lock must block while TTL is active");

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 200));

      const lockAfterExpiry = await acquireLock("order-ttl");
      assert.ok(
        lockAfterExpiry !== null,
        "should re-acquire lock after TTL expiry"
      );
    } finally {
      if (originalTtl !== undefined) {
        process.env.ESCROW_FUNDING_LOCK_TTL_MS = originalTtl;
      } else {
        delete process.env.ESCROW_FUNDING_LOCK_TTL_MS;
      }
    }
  });
});
