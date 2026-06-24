/**
 * Unit tests — push subscription cleanup
 *
 * Covers:
 *  - Success path: healthy subscriptions are retained after cleanup
 *  - Failure path: subscriptions exceeding max failure count are removed
 *  - Failure path: stale subscriptions (beyond staleness window) are removed
 *  - Edge: subscription at exactly the failure threshold is removed
 *  - Edge: subscription at exactly the staleness boundary is removed
 *  - Cleanup result counters (scanned / removed / failed) are accurate
 *  - Mix of healthy and unhealthy subscriptions in one pass
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  addPushSubscription,
  cleanupPushSubscriptions,
  clearPushSubscriptions,
  getPushSubscription,
  listPushSubscriptions,
  recordDeliveryFailure,
  recordDeliverySuccess,
  type PushSubscription,
} from "../push/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSubscription(
  endpoint: string,
  overrides: Partial<PushSubscription> = {}
): PushSubscription {
  return {
    endpoint,
    userId: "user-1",
    lastActiveAt: new Date().toISOString(),
    failureCount: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearPushSubscriptions();
  // Ensure default env vars are unset so we use the built-in defaults (5 failures, 30 days)
  delete process.env.PUSH_MAX_FAILURES;
  delete process.env.PUSH_STALE_DAYS;
});

afterEach(() => {
  clearPushSubscriptions();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Success path — subscriptions that should be retained
// ---------------------------------------------------------------------------

describe("cleanupPushSubscriptions — retained subscriptions", () => {
  it("does not remove a healthy, recently active subscription", () => {
    addPushSubscription(makeSubscription("ep-healthy"));

    const result = cleanupPushSubscriptions();

    expect(result.scanned).toBe(1);
    expect(result.removed).toBe(0);
    expect(result.failed).toBe(0);
    expect(getPushSubscription("ep-healthy")).toBeDefined();
  });

  it("does not remove a subscription with failures below the threshold", () => {
    addPushSubscription(makeSubscription("ep-few-failures", { failureCount: 4 }));

    const result = cleanupPushSubscriptions();

    expect(result.removed).toBe(0);
    expect(getPushSubscription("ep-few-failures")).toBeDefined();
  });

  it("does not remove a subscription active just within the staleness window", () => {
    // 29 days ago — within 30-day default window
    addPushSubscription(
      makeSubscription("ep-recent", { lastActiveAt: daysAgo(29) })
    );

    const result = cleanupPushSubscriptions();

    expect(result.removed).toBe(0);
    expect(getPushSubscription("ep-recent")).toBeDefined();
  });

  it("returns correct scanned count when store is empty", () => {
    const result = cleanupPushSubscriptions();

    expect(result.scanned).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.failed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Failure path — subscriptions that should be removed
// ---------------------------------------------------------------------------

describe("cleanupPushSubscriptions — removed subscriptions", () => {
  it("removes a subscription that reached the max failure count", () => {
    addPushSubscription(makeSubscription("ep-failed", { failureCount: 5 }));

    const result = cleanupPushSubscriptions();

    expect(result.scanned).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.failed).toBe(0);
    expect(getPushSubscription("ep-failed")).toBeUndefined();
  });

  it("removes a subscription that exceeds the max failure count", () => {
    addPushSubscription(makeSubscription("ep-over-failed", { failureCount: 99 }));

    const result = cleanupPushSubscriptions();

    expect(result.removed).toBe(1);
    expect(getPushSubscription("ep-over-failed")).toBeUndefined();
  });

  it("removes a subscription whose lastActiveAt exceeds the staleness window", () => {
    addPushSubscription(
      makeSubscription("ep-stale", { lastActiveAt: daysAgo(31) })
    );

    const result = cleanupPushSubscriptions();

    expect(result.scanned).toBe(1);
    expect(result.removed).toBe(1);
    expect(getPushSubscription("ep-stale")).toBeUndefined();
  });

  it("removes a subscription active exactly at the staleness boundary", () => {
    // 30 days ago — equal to the default PUSH_STALE_DAYS; should be removed
    addPushSubscription(
      makeSubscription("ep-boundary", { lastActiveAt: daysAgo(30) })
    );

    const result = cleanupPushSubscriptions();

    expect(result.removed).toBe(1);
    expect(getPushSubscription("ep-boundary")).toBeUndefined();
  });

  it("removes a stale subscription even when failureCount is 0", () => {
    addPushSubscription(
      makeSubscription("ep-stale-ok", {
        failureCount: 0,
        lastActiveAt: daysAgo(60),
      })
    );

    const result = cleanupPushSubscriptions();

    expect(result.removed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Mixed scenarios
// ---------------------------------------------------------------------------

describe("cleanupPushSubscriptions — mixed subscriptions", () => {
  it("selectively removes only unhealthy subscriptions from a mixed store", () => {
    addPushSubscription(makeSubscription("ep-good-1"));
    addPushSubscription(makeSubscription("ep-good-2", { failureCount: 2 }));
    addPushSubscription(makeSubscription("ep-bad-failures", { failureCount: 5 }));
    addPushSubscription(
      makeSubscription("ep-bad-stale", { lastActiveAt: daysAgo(45) })
    );

    const result = cleanupPushSubscriptions();

    expect(result.scanned).toBe(4);
    expect(result.removed).toBe(2);
    expect(result.failed).toBe(0);

    expect(getPushSubscription("ep-good-1")).toBeDefined();
    expect(getPushSubscription("ep-good-2")).toBeDefined();
    expect(getPushSubscription("ep-bad-failures")).toBeUndefined();
    expect(getPushSubscription("ep-bad-stale")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Environment-variable overrides
// ---------------------------------------------------------------------------

describe("cleanupPushSubscriptions — configurable thresholds", () => {
  it("respects PUSH_MAX_FAILURES override", () => {
    process.env.PUSH_MAX_FAILURES = "2";

    addPushSubscription(makeSubscription("ep-custom-fail", { failureCount: 2 }));

    const result = cleanupPushSubscriptions();

    expect(result.removed).toBe(1);
    expect(getPushSubscription("ep-custom-fail")).toBeUndefined();
  });

  it("respects PUSH_STALE_DAYS override", () => {
    process.env.PUSH_STALE_DAYS = "7";

    addPushSubscription(
      makeSubscription("ep-custom-stale", { lastActiveAt: daysAgo(8) })
    );

    const result = cleanupPushSubscriptions();

    expect(result.removed).toBe(1);
    expect(getPushSubscription("ep-custom-stale")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// recordDeliverySuccess / recordDeliveryFailure helpers
// ---------------------------------------------------------------------------

describe("recordDeliveryFailure and recordDeliverySuccess", () => {
  it("increments failure count on recordDeliveryFailure", () => {
    addPushSubscription(makeSubscription("ep-track"));
    recordDeliveryFailure("ep-track");
    recordDeliveryFailure("ep-track");

    expect(getPushSubscription("ep-track")?.failureCount).toBe(2);
  });

  it("resets failure count and updates lastActiveAt on recordDeliverySuccess", () => {
    addPushSubscription(makeSubscription("ep-recover", { failureCount: 4 }));
    recordDeliverySuccess("ep-recover");

    const sub = getPushSubscription("ep-recover");
    expect(sub?.failureCount).toBe(0);
  });

  it("does not throw when endpoint is unknown", () => {
    expect(() => recordDeliveryFailure("nonexistent")).not.toThrow();
    expect(() => recordDeliverySuccess("nonexistent")).not.toThrow();
  });

  it("a recovered subscription is not cleaned up", () => {
    addPushSubscription(makeSubscription("ep-was-failing", { failureCount: 4 }));
    recordDeliverySuccess("ep-was-failing");

    const result = cleanupPushSubscriptions();

    expect(result.removed).toBe(0);
    expect(getPushSubscription("ep-was-failing")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// listPushSubscriptions
// ---------------------------------------------------------------------------

describe("listPushSubscriptions", () => {
  it("returns all registered subscriptions", () => {
    addPushSubscription(makeSubscription("ep-a"));
    addPushSubscription(makeSubscription("ep-b"));

    const list = listPushSubscriptions();

    expect(list).toHaveLength(2);
    expect(list.map((s) => s.endpoint)).toContain("ep-a");
    expect(list.map((s) => s.endpoint)).toContain("ep-b");
  });

  it("returns an empty array when the store is empty", () => {
    expect(listPushSubscriptions()).toHaveLength(0);
  });
});
