import { describe, expect, it } from "vitest";
import type { Order } from "@delegolabs/types";
import {
  UNCATEGORIZED,
  availableCategories,
  availableMerchants,
  buildExpenseReport,
  expenseReportFilename,
  expenseReportToCsv,
  expenseReportToJson,
  orderCategory,
  orderMerchant,
} from "./expenseReportBuilder";

function makeOrder(overrides: Record<string, unknown> = {}): Order {
  return {
    id: "order-1",
    merchantId: "merchant-a",
    category: "Electronics",
    status: "settled",
    totalStroops: 10_000_000n,
    lineItems: [],
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    updatedAt: new Date("2026-01-15T10:00:00.000Z"),
    ...overrides,
  } as unknown as Order;
}

const FILTER = {
  startDate: new Date(2026, 0, 1),
  endDate: new Date(2026, 0, 31),
  categories: [] as string[],
  format: "csv" as const,
};

describe("orderCategory / orderMerchant", () => {
  it("prefers the order category, then the first line item category", () => {
    expect(orderCategory(makeOrder({ category: "Travel" }))).toBe("Travel");
    expect(
      orderCategory(
        makeOrder({
          category: undefined,
          lineItems: [{ category: "Office" }, { category: "Travel" }],
        })
      )
    ).toBe("Office");
    expect(orderCategory(makeOrder({ category: undefined }))).toBe(
      UNCATEGORIZED
    );
  });

  it("falls back to merchant name then a placeholder", () => {
    expect(orderMerchant(makeOrder())).toBe("merchant-a");
    expect(orderMerchant(makeOrder({ merchantId: undefined, merchantName: "Acme" }))).toBe(
      "Acme"
    );
    expect(orderMerchant(makeOrder({ merchantId: undefined }))).toBe(
      "Unknown merchant"
    );
  });
});

describe("availableCategories / availableMerchants", () => {
  it("returns distinct, sorted values", () => {
    const orders = [
      makeOrder({ category: "Travel" }),
      makeOrder({ category: "Electronics" }),
      makeOrder({ category: "Travel", merchantId: "merchant-b" }),
    ];
    expect(availableCategories(orders)).toEqual(["Electronics", "Travel"]);
    expect(availableMerchants(orders)).toEqual(["merchant-a", "merchant-b"]);
  });
});

describe("buildExpenseReport", () => {
  it("includes orders within the inclusive date range and sums totals", () => {
    const orders = [
      makeOrder({ id: "in", totalStroops: 5_000_000n }),
      makeOrder({
        id: "before",
        createdAt: new Date(2025, 11, 31, 23, 59, 59),
      }),
      makeOrder({
        id: "after",
        createdAt: new Date(2026, 1, 1, 0, 0, 0),
      }),
    ];

    const report = buildExpenseReport(orders, FILTER);

    expect(report.orderCount).toBe(1);
    expect(report.rows[0].orderId).toBe("in");
    expect(report.totalStroops).toBe(5_000_000n);
  });

  it("filters by category and merchant", () => {
    const orders = [
      makeOrder({ id: "a", category: "Travel", merchantId: "merchant-a" }),
      makeOrder({ id: "b", category: "Electronics", merchantId: "merchant-a" }),
      makeOrder({ id: "c", category: "Travel", merchantId: "merchant-b" }),
    ];

    const report = buildExpenseReport(orders, {
      ...FILTER,
      categories: ["Travel"],
      merchants: ["merchant-a"],
    });

    expect(report.rows.map((row) => row.orderId)).toEqual(["a"]);
  });

  it("sorts rows newest first", () => {
    const orders = [
      makeOrder({ id: "old", createdAt: new Date(2026, 0, 5) }),
      makeOrder({ id: "new", createdAt: new Date(2026, 0, 25) }),
    ];
    expect(
      buildExpenseReport(orders, FILTER).rows.map((row) => row.orderId)
    ).toEqual(["new", "old"]);
  });
});

describe("serialization", () => {
  const report = buildExpenseReport(
    [makeOrder({ category: "Travel", totalStroops: 2_500_000n })],
    FILTER
  );

  it("renders a CSV with a header and one row per order", () => {
    const csv = expenseReportToCsv(report);
    const [header, row] = csv.split("\r\n");
    expect(header).toBe(
      "Order,Date,Merchant,Category,Status,Amount (stroops)"
    );
    expect(row).toContain("order-1");
    expect(row).toContain("merchant-a");
    expect(row).toContain("Travel");
    expect(row).toContain("2500000");
  });

  it("renders JSON with stringified stroops", () => {
    const parsed = JSON.parse(expenseReportToJson(report));
    expect(parsed.totalStroops).toBe("2500000");
    expect(parsed.orderCount).toBe(1);
    expect(parsed.rows).toHaveLength(1);
  });

  it("names the file by format and date", () => {
    expect(
      expenseReportFilename(report, "csv", new Date("2026-02-03T12:00:00Z"))
    ).toBe("delego-expense-report-2026-02-03.csv");
    expect(
      expenseReportFilename(report, "json", new Date("2026-02-03T12:00:00Z"))
    ).toBe("delego-expense-report-2026-02-03.json");
  });
});
