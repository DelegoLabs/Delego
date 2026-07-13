import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  cleanupPushSubscriptions,
  parseTrackedPushSubscription,
  recordPushDeliveryFailure,
  recordPushDeliverySuccess,
  shouldRemovePushSubscription,
  serializeTrackedPushSubscription,
  type TrackedPushSubscription,
  type PushSubscription,
} from "./index.js";

function makeSub(endpoint: string): PushSubscription {
  return {
    endpoint,
    keys: { p256dh: "p256dh-key", auth: "auth-key" },
  };
}

function makeTracked(
  endpoint: string,
  overrides: Partial<TrackedPushSubscription> = {}
): TrackedPushSubscription {
  return {
    subscription: makeSub(endpoint),
    failureCount: 0,
    createdAt: 1_000_000,
    ...overrides,
  };
}

describe("parseTrackedPushSubscription", () => {
  it("wraps legacy bare PushSubscription JSON", () => {
    const raw = JSON.stringify(makeSub("https://push.example/1"));
    const tracked = parseTrackedPushSubscription(raw, 5_000);
    expect(tracked.subscription.endpoint).toBe("https://push.example/1");
    expect(tracked.failureCount).toBe(0);
    expect(tracked.createdAt).toBe(5_000);
  });

  it("preserves tracked envelope fields", () => {
    const tracked = makeTracked("https://push.example/2", {
      failureCount: 3,
      lastFailedAt: 9_000,
      createdAt: 1_000,
    });
    const parsed = parseTrackedPushSubscription(
      serializeTrackedPushSubscription(tracked)
    );
    expect(parsed).toEqual(tracked);
  });
});

describe("recordPushDeliveryFailure / success", () => {
  it("increments failure count and sets lastFailedAt", () => {
    const next = recordPushDeliveryFailure(makeTracked("https://push.example/3"), 42);
    expect(next.failureCount).toBe(1);
    expect(next.lastFailedAt).toBe(42);
  });

  it("clears failure state on success", () => {
    const failed = recordPushDeliveryFailure(makeTracked("https://push.example/4"), 10);
    const ok = recordPushDeliverySuccess(failed);
    expect(ok.failureCount).toBe(0);
    expect(ok.lastFailedAt).toBeUndefined();
  });
});

describe("shouldRemovePushSubscription", () => {
  const originalMax = process.env.PUSH_MAX_FAILURES;
  const originalStale = process.env.PUSH_STALE_MS;

  beforeEach(() => {
    process.env.PUSH_MAX_FAILURES = "5";
    process.env.PUSH_STALE_MS = String(90 * 24 * 60 * 60 * 1000);
  });

  afterEach(() => {
    if (originalMax === undefined) delete process.env.PUSH_MAX_FAILURES;
    else process.env.PUSH_MAX_FAILURES = originalMax;
    if (originalStale === undefined) delete process.env.PUSH_STALE_MS;
    else process.env.PUSH_STALE_MS = originalStale;
  });

  it("retains healthy recent subscriptions", () => {
    expect(
      shouldRemovePushSubscription(makeTracked("https://push.example/ok"), 1_000_100)
    ).toBe(false);
  });

  it("removes subscriptions that exceed failure threshold", () => {
    expect(
      shouldRemovePushSubscription(
        makeTracked("https://push.example/fail", { failureCount: 5 }),
        1_000_100
      )
    ).toBe(true);
  });

  it("removes stale subscriptions based on createdAt", () => {
    const staleMs = 90 * 24 * 60 * 60 * 1000;
    expect(
      shouldRemovePushSubscription(
        makeTracked("https://push.example/stale", { createdAt: 0 }),
        staleMs
      )
    ).toBe(true);
  });
});

describe("cleanupPushSubscriptions", () => {
  it("retains healthy subscriptions and removes failing ones", () => {
    const now = 1_000_000;
    const healthy = makeTracked("https://push.example/keep", {
      createdAt: now - 1000,
    });
    const failing = makeTracked("https://push.example/drop", {
      failureCount: 5,
      createdAt: now - 1000,
    });

    const { result, retained, removed } = cleanupPushSubscriptions(
      [healthy, failing],
      now
    );

    expect(result).toEqual({ scanned: 2, removed: 1, failed: 0 });
    expect(retained).toEqual([healthy]);
    expect(removed).toEqual([failing]);
  });

  it("counts malformed entries as failed and removes them", () => {
    const malformed = {
      subscription: { endpoint: "" } as PushSubscription,
      failureCount: 0,
      createdAt: 1,
    };
    const { result, retained, removed } = cleanupPushSubscriptions([malformed]);
    expect(result.scanned).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.removed).toBe(1);
    expect(retained).toHaveLength(0);
    expect(removed).toHaveLength(1);
  });

  it("removes stale subscriptions while keeping fresh ones", () => {
    const staleMs = 90 * 24 * 60 * 60 * 1000;
    const now = staleMs + 10;
    const fresh = makeTracked("https://push.example/fresh", {
      createdAt: now - 1000,
    });
    const stale = makeTracked("https://push.example/old", { createdAt: 0 });

    const { result, retained, removed } = cleanupPushSubscriptions(
      [fresh, stale],
      now
    );

    expect(result.scanned).toBe(2);
    expect(result.removed).toBe(1);
    expect(result.failed).toBe(0);
    expect(retained.map((s) => s.subscription.endpoint)).toEqual([
      "https://push.example/fresh",
    ]);
    expect(removed.map((s) => s.subscription.endpoint)).toEqual([
      "https://push.example/old",
    ]);
  });
});
