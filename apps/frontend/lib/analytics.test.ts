import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Order } from "@delegolabs/types";
import {
  isEmptySeries,
  parseAnalyticsRange,
  spendByRange,
  trackEvent,
  trackMarketingEvent,
  trackEssentialEvent,
  setAnalyticsEmitter,
} from "./analytics";
import { resetConsentForTesting, acceptAllConsent, setConsentPreferences } from "./consent";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId: "user-1",
    delegationId: "del-1",
    merchantId: "merchant-1",
    status: "settled",
    lineItems: [],
    totalStroops: 10_000_000n,
    escrowContractId: null,
    createdAt: new Date("2026-08-20T12:00:00Z"),
    updatedAt: new Date("2026-08-20T12:00:00Z"),
    ...overrides,
  };
}

const NOW = new Date("2026-08-24T18:00:00Z");

describe("parseAnalyticsRange", () => {
  it("accepts known ranges", () => {
    expect(parseAnalyticsRange("7d")).toBe("7d");
    expect(parseAnalyticsRange("90d")).toBe("90d");
  });

  it("falls back to the default for missing/unknown values", () => {
    expect(parseAnalyticsRange(null)).toBe("30d");
    expect(parseAnalyticsRange("nonsense")).toBe("30d");
  });
});

describe("spendByRange", () => {
  it("sums spend into daily buckets for 7D, zero-filling days with no orders", () => {
    const orders = [
      makeOrder({
        id: "a",
        createdAt: new Date("2026-08-20T09:00:00Z"),
        totalStroops: 10_000_000n,
      }),
      makeOrder({
        id: "b",
        createdAt: new Date("2026-08-20T15:00:00Z"),
        totalStroops: 5_000_000n,
      }),
      makeOrder({
        id: "c",
        createdAt: new Date("2026-08-22T09:00:00Z"),
        totalStroops: 2_000_000n,
      }),
    ];

    const buckets = spendByRange(orders, "7d", { now: NOW });

    expect(buckets).toHaveLength(7);
    const totals = buckets.map((b) => b.totalStroops);
    expect(totals.reduce((a, b) => a + b, 0n)).toBe(17_000_000n);
    // Days with no orders are present with a zero total, not omitted.
    expect(buckets.some((b) => b.totalStroops === 0n)).toBe(true);
  });

  it("excludes orders that never became real spend", () => {
    const orders = [
      makeOrder({ id: "draft", status: "draft", totalStroops: 999_000_000n }),
      makeOrder({
        id: "pending",
        status: "pending_approval",
        totalStroops: 999_000_000n,
      }),
      makeOrder({
        id: "cancelled",
        status: "cancelled",
        totalStroops: 999_000_000n,
      }),
      makeOrder({ id: "settled", status: "settled", totalStroops: 3_000_000n }),
    ];

    const buckets = spendByRange(orders, "7d", { now: NOW });
    const total = buckets.reduce((sum, b) => sum + b.totalStroops, 0n);
    expect(total).toBe(3_000_000n);
  });

  it("excludes orders outside the range window", () => {
    const orders = [
      makeOrder({
        id: "old",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        totalStroops: 50_000_000n,
      }),
    ];
    const buckets = spendByRange(orders, "7d", { now: NOW });
    expect(isEmptySeries(buckets)).toBe(true);
  });

  it("buckets 90D by week instead of by day", () => {
    const buckets = spendByRange([], "90d", { now: NOW });
    // ~90 days / 7 <= 14 week buckets, definitely fewer than 90.
    expect(buckets.length).toBeLessThan(20);
    expect(buckets[0].label).toContain("–");
  });
});

describe("isEmptySeries", () => {
  it("is true only when every bucket is zero", () => {
    expect(
      isEmptySeries([{ bucketStart: "x", label: "x", totalStroops: 0n }])
    ).toBe(true);
    expect(
      isEmptySeries([
        { bucketStart: "x", label: "x", totalStroops: 0n },
        { bucketStart: "y", label: "y", totalStroops: 1n },
      ])
    ).toBe(false);
  });
});

describe("telemetry emitter choke point (#612)", () => {
  beforeEach(() => {
    resetConsentForTesting();
    setAnalyticsEmitter(() => {});
  });

  it("choke-point spy: consent off (no choice made yet) -> trackEvent never fires the emitter", () => {
    const spy = vi.fn();
    setAnalyticsEmitter(spy);

    trackEvent("viewed_page", { path: "/orders" });

    expect(spy).not.toHaveBeenCalled();
  });

  it("choke-point spy: essential-only consent -> trackEvent still never fires", () => {
    setConsentPreferences({ productAnalytics: false, marketing: false }, "settings");
    const spy = vi.fn();
    setAnalyticsEmitter(spy);

    trackEvent("viewed_page");

    expect(spy).not.toHaveBeenCalled();
  });

  it("fires the emitter once productAnalytics consent is granted", () => {
    setConsentPreferences({ productAnalytics: true, marketing: false }, "settings");
    const spy = vi.fn();
    setAnalyticsEmitter(spy);

    trackEvent("viewed_page", { path: "/orders" });

    expect(spy).toHaveBeenCalledWith({ name: "viewed_page", properties: { path: "/orders" } });
  });

  it("trackMarketingEvent is gated on marketing consent, independent of productAnalytics", () => {
    setConsentPreferences({ productAnalytics: true, marketing: false }, "settings");
    const spy = vi.fn();
    setAnalyticsEmitter(spy);

    trackMarketingEvent("campaign_click");

    expect(spy).not.toHaveBeenCalled();
  });

  it("trackMarketingEvent fires once marketing consent is granted", () => {
    acceptAllConsent();
    const spy = vi.fn();
    setAnalyticsEmitter(spy);

    trackMarketingEvent("campaign_click");

    expect(spy).toHaveBeenCalledWith({ name: "campaign_click", properties: undefined });
  });

  it("consent changes apply immediately mid-session: a change between two trackEvent calls affects the second one", () => {
    const spy = vi.fn();
    setAnalyticsEmitter(spy);

    trackEvent("before_consent");
    expect(spy).not.toHaveBeenCalled();

    setConsentPreferences({ productAnalytics: true, marketing: false }, "settings");
    trackEvent("after_consent");

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ name: "after_consent", properties: undefined });
  });

  it("revoking consent mid-session stops further events immediately", () => {
    setConsentPreferences({ productAnalytics: true, marketing: false }, "settings");
    const spy = vi.fn();
    setAnalyticsEmitter(spy);

    trackEvent("while_granted");
    expect(spy).toHaveBeenCalledTimes(1);

    setConsentPreferences({ productAnalytics: false, marketing: false }, "settings");
    trackEvent("after_revoke");

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("trackEssentialEvent always fires regardless of consent state", () => {
    const spy = vi.fn();
    setAnalyticsEmitter(spy);

    trackEssentialEvent("app_error", { code: "network" });

    expect(spy).toHaveBeenCalledWith({ name: "app_error", properties: { code: "network" } });
  });
});
