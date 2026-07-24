import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  acquireLock,
  releaseLock,
  getFundingLock,
  _resetLockRedisClient,
  _setLockRedisClientForTesting,
  type LockRedisClient,
} from "./validation.js";

describe("Escrow Funding Lock Mechanisms", () => {
  beforeEach(() => {
    _resetLockRedisClient();
  });

  afterEach(() => {
    _resetLockRedisClient();
  });

  it("acquires lock successfully for a new order", async () => {
    const orderId = "order-test-001";
    const acquired = await acquireLock(orderId, 30000);
    expect(acquired).toBe(true);

    const lock = getFundingLock(orderId);
    expect(lock).not.toBeNull();
    expect(lock?.orderId).toBe(orderId);
    expect(lock?.ttlMs).toBe(30000);
    expect(lock?.lockToken).toBeDefined();
    expect(lock?.createdAt).toBeGreaterThan(0);
    expect(lock?.acquiredAt).toBeDefined();
  });

  it("blocks secondary concurrent lock attempts for the same order", async () => {
    const orderId = "order-test-002";
    const firstAcquire = await acquireLock(orderId, 30000);
    expect(firstAcquire).toBe(true);

    const secondAcquire = await acquireLock(orderId, 30000);
    expect(secondAcquire).toBe(false);
  });

  it("releases lock cleanly on completion", async () => {
    const orderId = "order-test-003";
    const acquired = await acquireLock(orderId, 30000);
    expect(acquired).toBe(true);

    await releaseLock(orderId);

    const lockAfterRelease = getFundingLock(orderId);
    expect(lockAfterRelease).toBeNull();

    // Secondary acquire should succeed now
    const reAcquire = await acquireLock(orderId, 30000);
    expect(reAcquire).toBe(true);
  });

  it("automatically clears lock after TTL timeout", async () => {
    const orderId = "order-test-004";
    const shortTtl = 50; // 50ms TTL

    const acquired = await acquireLock(orderId, shortTtl);
    expect(acquired).toBe(true);

    // Immediately secondary attempt is blocked
    expect(await acquireLock(orderId, shortTtl)).toBe(false);

    // Wait for TTL to expire
    await new Promise((res) => setTimeout(res, 60));

    // After TTL expires, acquireLock should succeed again
    const afterExpiryAcquire = await acquireLock(orderId, shortTtl);
    expect(afterExpiryAcquire).toBe(true);
  });

  it("scripted lock deletion safely releases only with matching token", async () => {
    const mockEvaluator = vi.fn().mockImplementation((_script, _numkeys, _key, token) => {
      if (token === "correct-token") return Promise.resolve(1);
      return Promise.resolve(0);
    });

    const mockDel = vi.fn().mockResolvedValue(1);
    const mockSet = vi.fn().mockResolvedValue("OK");
    const mockGet = vi.fn().mockResolvedValue("correct-token");

    const mockRedis: LockRedisClient = {
      set: mockSet,
      eval: mockEvaluator,
      del: mockDel,
      get: mockGet,
    };

    _setLockRedisClientForTesting(mockRedis);

    const orderId = "order-test-005";
    await acquireLock(orderId, 10000, "correct-token");

    await releaseLock(orderId, "wrong-token");
    expect(mockEvaluator).toHaveBeenCalledWith(expect.any(String), 1, expect.any(String), "wrong-token");

    await releaseLock(orderId, "correct-token");
    expect(mockEvaluator).toHaveBeenCalledWith(expect.any(String), 1, expect.any(String), "correct-token");
  });
});
