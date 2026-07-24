/**
 * Tests for Circuit Breaker (Issue #353).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  setEscrowCircuitBreaker,
  getEscrowCircuitBreaker,
} from "./circuitBreaker.js";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeoutMs: 100,
      halfOpenSuccessThreshold: 2,
      failureWindowMs: 60_000,
    });
  });

  it("starts in closed state", () => {
    expect(breaker.getState()).toBe("closed");
  });

  it("passes requests through in closed state", async () => {
    const result = await breaker.execute(async () => 42);
    expect(result).toBe(42);
  });

  it("opens after failure threshold is reached", async () => {
    // Fail 3 times (threshold)
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("RPC failed");
        });
      } catch {
        // expected
      }
    }

    expect(breaker.getState()).toBe("open");
  });

  it("rejects requests when open", async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("RPC failed");
        });
      } catch {
        // expected
      }
    }

    await expect(
      breaker.execute(async () => 42)
    ).rejects.toThrow(CircuitBreakerOpenError);
  });

  it("transitions to half-open after recovery timeout", async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("RPC failed");
        });
      } catch {
        // expected
      }
    }

    expect(breaker.getState()).toBe("open");

    // Wait for recovery timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(breaker.getState()).toBe("half_open");
  });

  it("closes after successful requests in half-open state", async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("RPC failed");
        });
      } catch {
        // expected
      }
    }

    // Wait for half-open
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Succeed twice (halfOpenSuccessThreshold)
    await breaker.execute(async () => "ok");
    await breaker.execute(async () => "ok");

    expect(breaker.getState()).toBe("closed");
  });

  it("opens again if half-open request fails", async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("RPC failed");
        });
      } catch {
        // expected
      }
    }

    // Wait for half-open
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Fail once in half-open
    try {
      await breaker.execute(async () => {
        throw new Error("Still failing");
      });
    } catch {
      // expected
    }

    expect(breaker.getState()).toBe("open");
  });

  it("resets failure count on success in closed state", async () => {
    // Fail twice (below threshold)
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("RPC failed");
        });
      } catch {
        // expected
      }
    }

    // Succeed - resets failure count
    await breaker.execute(async () => "ok");

    // Fail twice again (should not trip because reset)
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("RPC failed");
        });
      } catch {
        // expected
      }
    }

    expect(breaker.getState()).toBe("closed");
  });

  it("tracks statistics correctly", async () => {
    await breaker.execute(async () => "ok");
    try {
      await breaker.execute(async () => {
        throw new Error("fail");
      });
    } catch {
      // expected
    }

    const stats = breaker.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.totalFailures).toBe(1);
    expect(stats.lastSuccessAt).toBeInstanceOf(Date);
    expect(stats.lastFailureAt).toBeInstanceOf(Date);
  });

  it("manually resets to closed state", async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("RPC failed");
        });
      } catch {
        // expected
      }
    }

    expect(breaker.getState()).toBe("open");

    breaker.reset();
    expect(breaker.getState()).toBe("closed");
  });
});

describe("Escrow Circuit Breaker singleton", () => {
  afterEach(() => {
    setEscrowCircuitBreaker(new CircuitBreaker());
  });

  it("returns a singleton circuit breaker", () => {
    const b1 = getEscrowCircuitBreaker();
    const b2 = getEscrowCircuitBreaker();
    expect(b1).toBe(b2);
  });

  it("allows replacing the singleton", () => {
    const custom = new CircuitBreaker({ failureThreshold: 10 });
    setEscrowCircuitBreaker(custom);
    expect(getEscrowCircuitBreaker()).toBe(custom);
  });
});
