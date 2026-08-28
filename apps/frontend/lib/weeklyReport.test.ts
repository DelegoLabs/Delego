import { describe, it, expect } from "vitest";
import type { Order } from "@delegolabs/types";
import { buildWeeklyReport, formatReportAsText } from "./weeklyReport";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    delegationId: "del-1",
    status: "settled",
    lineItems: [],
    totalStroops: 10_000_000n,
    createdAt: new Date("2026-06-15T00:00:00Z"),
    ...overrides,
  } as Order;
}

const PERIOD_END = new Date("2026-06-22T00:00:00Z"); // Monday

describe("buildWeeklyReport", () => {
  it("sums spend only from spend-eligible statuses within the current period", () => {
    const orders = [
      makeOrder({ id: "o1", status: "settled", totalStroops: 10_000_000n, createdAt: new Date("2026-06-16") }),
      makeOrder({ id: "o2", status: "pending_approval", totalStroops: 99_000_000n, createdAt: new Date("2026-06-17") }),
      makeOrder({ id: "o3", status: "rejected", totalStroops: 50_000_000n, createdAt: new Date("2026-06-18") }),
    ];
    const report = buildWeeklyReport(orders, PERIOD_END, 1);

    // Only o1 (settled) counts as spend: 10_000_000 stroops = 1.00 XLM.
    expect(report.totalSpendStroops.current).toBe(1);
    expect(report.orderCount.current).toBe(3); // orderCount counts all orders in-period, not just spend.
  });

  it("excludes orders outside the current/previous period window", () => {
    const orders = [
      makeOrder({ id: "in", createdAt: new Date("2026-06-18") }),
      makeOrder({ id: "too-old", createdAt: new Date("2026-01-01") }),
    ];
    const report = buildWeeklyReport(orders, PERIOD_END, 1);

    expect(report.orderCount.current).toBe(1);
  });

  it("computes percentChange correctly, including the previous=0 edge case", () => {
    const orders = [
      // Current period (last 7 days before PERIOD_END).
      makeOrder({ id: "cur", status: "settled", totalStroops: 20_000_000n, createdAt: new Date("2026-06-18") }),
      // Previous period (7 days before that).
      makeOrder({ id: "prev", status: "settled", totalStroops: 10_000_000n, createdAt: new Date("2026-06-10") }),
    ];
    const report = buildWeeklyReport(orders, PERIOD_END, 1);

    expect(report.totalSpendStroops.current).toBe(2);
    expect(report.totalSpendStroops.previous).toBe(1);
    expect(report.totalSpendStroops.percentChange).toBe(100);
  });

  it("returns null percentChange when previous period had activity of 0 and current is nonzero", () => {
    const orders = [
      makeOrder({ id: "cur", status: "settled", totalStroops: 10_000_000n, createdAt: new Date("2026-06-18") }),
    ];
    const report = buildWeeklyReport(orders, PERIOD_END, 1);

    expect(report.totalSpendStroops.previous).toBe(0);
    expect(report.totalSpendStroops.percentChange).toBeNull();
  });

  it("ranks top delegations by total spend, descending", () => {
    const orders = [
      makeOrder({ id: "a1", delegationId: "del-a", status: "settled", totalStroops: 5_000_000n, createdAt: new Date("2026-06-18") }),
      makeOrder({ id: "b1", delegationId: "del-b", status: "settled", totalStroops: 20_000_000n, createdAt: new Date("2026-06-18") }),
      makeOrder({ id: "b2", delegationId: "del-b", status: "settled", totalStroops: 5_000_000n, createdAt: new Date("2026-06-19") }),
    ];
    const report = buildWeeklyReport(orders, PERIOD_END, 1);

    expect(report.topDelegations[0].delegationId).toBe("del-b");
    expect(report.topDelegations[0].totalStroops).toBe(25_000_000n);
    expect(report.topDelegations[0].orderCount).toBe(2);
    expect(report.topDelegations[1].delegationId).toBe("del-a");
  });

  it("surfaces disputed and rejected orders as notable events", () => {
    const orders = [
      makeOrder({ id: "d1", status: "disputed", createdAt: new Date("2026-06-18") }),
      makeOrder({
        id: "r1",
        status: "rejected",
        rejectionReason: "too_expensive",
        rejectionNote: "over budget",
        createdAt: new Date("2026-06-19"),
      }),
    ];
    const report = buildWeeklyReport(orders, PERIOD_END, 1);

    expect(report.notableEvents).toHaveLength(2);
    const dispute = report.notableEvents.find((e) => e.orderId === "d1");
    expect(dispute?.type).toBe("dispute_opened");
    const rejection = report.notableEvents.find((e) => e.orderId === "r1");
    expect(rejection?.type).toBe("rejection");
    expect(rejection?.detail).toBe("Too expensive: over budget");
  });
});

describe("formatReportAsText", () => {
  it("renders a plain-text summary with no markdown syntax", () => {
    const orders = [
      makeOrder({ id: "o1", status: "settled", delegationId: "del-a", totalStroops: 10_000_000n, createdAt: new Date("2026-06-18") }),
    ];
    const report = buildWeeklyReport(orders, PERIOD_END, 1);
    const text = formatReportAsText(report);

    expect(text).toContain("Weekly Report:");
    expect(text).toContain("Total spend: 1.00 XLM");
    expect(text).toContain("del-a");
    expect(text).not.toMatch(/[*_#`]/);
  });

  it("shows placeholders for empty sections instead of blank lines", () => {
    const report = buildWeeklyReport([], PERIOD_END, 1);
    const text = formatReportAsText(report);

    expect(text).toContain("Top delegations:\n  (none)");
    expect(text).toContain("Notable events:\n  (none)");
  });
});
