import { describe, it, expect } from "vitest";
import type { Delegation, Order } from "@delegolabs/types";
import {
  computeSpendingByCategory,
  parseSpendingCategoryRange,
  percentOfTotal,
  spendingForMode,
  DEFAULT_SPENDING_CATEGORY_RANGE,
} from "./spendingByCategory";

const NOW = new Date("2026-06-15T12:00:00.000Z");

const NEW_THIS_MONTH = new Date("2026-06-10T00:00:00.000Z");
const LAST_MONTH = new Date("2026-05-10T00:00:00.000Z");
const LAST_YEAR = new Date("2025-12-10T00:00:00.000Z");

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-x",
    delegationId: "del-1",
    status: "settled",
    totalStroops: 10_000_000n,
    createdAt: NEW_THIS_MONTH,
    updatedAt: NEW_THIS_MONTH,
    ...overrides,
  } as Order;
}

function delegation(
  overrides: Partial<Delegation> & { id: string }
): Delegation {
  return {
    userId: "user-1",
    agentId: "agent-1",
    status: "active",
    policy: { maxPerTransaction: 0n, maxTotal: 0n, allowedMerchants: [] },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Delegation;
}

const AUTONOMOUS = delegation({ id: "del-1", permissionLevel: "AUTO_APPROVE" });
const MANUAL = delegation({ id: "del-2", permissionLevel: "SIGNER" });

describe("percentOfTotal", () => {
  it("returns 0 when the whole is zero or negative", () => {
    expect(percentOfTotal(5n, 0n)).toBe(0);
    expect(percentOfTotal(5n, -10n)).toBe(0);
  });

  it("rounds to the nearest tenth of a percent", () => {
    // 2/3 = 66.666... -> 66.7
    expect(percentOfTotal(2n, 3n)).toBe(66.7);
    // 1/3 = 33.333... -> 33.3
    expect(percentOfTotal(1n, 3n)).toBe(33.3);
    // 1/2 = 50.0
    expect(percentOfTotal(1n, 2n)).toBe(50);
    // 1/4 = 25
    expect(percentOfTotal(1n, 4n)).toBe(25);
  });

  it("handles 100% and tiny shares", () => {
    expect(percentOfTotal(10n, 10n)).toBe(100);
    // 1/1000 = 0.1
    expect(percentOfTotal(1n, 1000n)).toBe(0.1);
  });
});

describe("parseSpendingCategoryRange", () => {
  it("accepts known ranges", () => {
    expect(parseSpendingCategoryRange("current_month")).toBe("current_month");
    expect(parseSpendingCategoryRange("last_30_days")).toBe("last_30_days");
    expect(parseSpendingCategoryRange("ytd")).toBe("ytd");
  });

  it("falls back to the default for missing or unknown values", () => {
    expect(parseSpendingCategoryRange(null)).toBe(
      DEFAULT_SPENDING_CATEGORY_RANGE
    );
    expect(parseSpendingCategoryRange("")).toBe(
      DEFAULT_SPENDING_CATEGORY_RANGE
    );
    expect(parseSpendingCategoryRange("garbage")).toBe(
      DEFAULT_SPENDING_CATEGORY_RANGE
    );
  });
});

describe("computeSpendingByCategory", () => {
  it("groups spend by category and computes percentage of total", () => {
    const result = computeSpendingByCategory(
      [
        order({ category: "Hardware", totalStroops: 30_000_000n }),
        order({ category: "Services", totalStroops: 10_000_000n }),
      ],
      [AUTONOMOUS],
      "current_month",
      { now: NOW }
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      category: "Hardware",
      totalSpentStroops: "30000000",
      percentageOfTotal: 75,
    });
    expect(result[1]).toMatchObject({
      category: "Services",
      totalSpentStroops: "10000000",
      percentageOfTotal: 25,
    });
  });

  it("sorts categories by total spend descending", () => {
    const result = computeSpendingByCategory(
      [
        order({ category: "Apparel", totalStroops: 5_000_000n }),
        order({ category: "Hardware", totalStroops: 50_000_000n }),
        order({ category: "Services", totalStroops: 20_000_000n }),
      ],
      [AUTONOMOUS],
      "current_month",
      { now: NOW }
    );
    expect(result.map((c) => c.category)).toEqual([
      "Hardware",
      "Services",
      "Apparel",
    ]);
  });

  it("splits autonomous vs manual spend by delegation permission level", () => {
    const result = computeSpendingByCategory(
      [
        order({
          category: "Hardware",
          delegationId: "del-1",
          totalStroops: 30_000_000n,
        }),
        order({
          category: "Hardware",
          delegationId: "del-2",
          totalStroops: 10_000_000n,
        }),
      ],
      [AUTONOMOUS, MANUAL],
      "current_month",
      { now: NOW }
    );

    expect(result[0]).toMatchObject({
      category: "Hardware",
      totalSpentStroops: "40000000",
      autonomousSpendStroops: "30000000",
      manualSpendStroops: "10000000",
    });
  });

  it("treats unknown permission levels and missing delegations as manual", () => {
    const result = computeSpendingByCategory(
      [
        order({
          category: "Hardware",
          delegationId: "del-1",
          totalStroops: 10_000_000n,
        }),
        order({
          category: "Hardware",
          delegationId: "missing",
          totalStroops: 5_000_000n,
        }),
      ],
      [MANUAL],
      "current_month",
      { now: NOW }
    );
    expect(result[0]).toMatchObject({
      autonomousSpendStroops: "0",
      manualSpendStroops: "15000000",
    });
  });

  it("excludes pending/draft orders that never became spend", () => {
    const result = computeSpendingByCategory(
      [
        order({
          category: "Hardware",
          status: "approved",
          totalStroops: 10_000_000n,
        }),
        order({
          category: "Hardware",
          status: "pending_approval",
          totalStroops: 99_000_000n,
        }),
        order({
          category: "Hardware",
          status: "draft",
          totalStroops: 99_000_000n,
        }),
      ],
      [AUTONOMOUS],
      "current_month",
      { now: NOW }
    );
    expect(result[0].totalSpentStroops).toBe("10000000");
  });

  it("filters orders outside the selected range", () => {
    const orders = [
      order({ category: "Hardware", createdAt: NEW_THIS_MONTH }),
      order({ category: "Hardware", createdAt: LAST_MONTH }),
      order({ category: "Hardware", createdAt: LAST_YEAR }),
    ];

    const currentMonth = computeSpendingByCategory(
      orders,
      [AUTONOMOUS],
      "current_month",
      { now: NOW }
    );
    expect(currentMonth).toHaveLength(1);

    const last30 = computeSpendingByCategory(
      orders,
      [AUTONOMOUS],
      "last_30_days",
      { now: NOW }
    );
    expect(last30).toHaveLength(1);

    const ytd = computeSpendingByCategory(orders, [AUTONOMOUS], "ytd", {
      now: NOW,
    });
    expect(ytd).toHaveLength(1);
  });

  it("falls back to the first line item's category when the order has none", () => {
    const result = computeSpendingByCategory(
      [
        order({
          totalStroops: 10_000_000n,
          lineItems: [
            {
              productId: "p-1",
              quantity: 1,
              unitPriceStroops: 10_000_000n,
              category: "Apparel",
            },
          ],
        }),
      ],
      [AUTONOMOUS],
      "current_month",
      { now: NOW }
    );
    expect(result[0].category).toBe("Apparel");
  });

  it("buckets orders with no category under Uncategorized", () => {
    const result = computeSpendingByCategory(
      [order({ category: "", totalStroops: 10_000_000n })],
      [AUTONOMOUS],
      "current_month",
      { now: NOW }
    );
    expect(result[0].category).toBe("Uncategorized");
  });

  it("ignores zero-amount orders", () => {
    const result = computeSpendingByCategory(
      [order({ category: "Hardware", totalStroops: 0n })],
      [AUTONOMOUS],
      "current_month",
      { now: NOW }
    );
    expect(result).toEqual([]);
  });

  it("returns an empty array when there is no spend", () => {
    expect(
      computeSpendingByCategory([], [], "current_month", { now: NOW })
    ).toEqual([]);
  });

  it("percentages across categories sum to ~100", () => {
    const result = computeSpendingByCategory(
      [
        order({ category: "A", totalStroops: 10_000_000n }),
        order({ category: "B", totalStroops: 20_000_000n }),
        order({ category: "C", totalStroops: 30_000_000n }),
      ],
      [AUTONOMOUS],
      "current_month",
      { now: NOW }
    );
    const sum = result.reduce((acc, c) => acc + c.percentageOfTotal, 0);
    expect(Math.round(sum)).toBe(100);
  });
});

describe("spendingForMode", () => {
  const categories = computeSpendingByCategory(
    [
      order({
        category: "Hardware",
        delegationId: "del-1",
        totalStroops: 30_000_000n,
      }),
      order({
        category: "Hardware",
        delegationId: "del-2",
        totalStroops: 10_000_000n,
      }),
      order({
        category: "Services",
        delegationId: "del-2",
        totalStroops: 20_000_000n,
      }),
    ],
    [AUTONOMOUS, MANUAL],
    "current_month",
    { now: NOW }
  );

  it("returns the categories untouched for the 'all' mode", () => {
    expect(spendingForMode(categories, "all")).toBe(categories);
  });

  it("re-bases totals and percentages onto the autonomous slice", () => {
    const result = spendingForMode(categories, "autonomous");

    expect(result[0]).toMatchObject({
      category: "Hardware",
      totalSpentStroops: "30000000",
      percentageOfTotal: 100,
    });
    // Services had no autonomous spend — it keeps a zero share.
    expect(result[1]).toMatchObject({
      category: "Services",
      totalSpentStroops: "0",
      percentageOfTotal: 0,
    });
  });

  it("re-bases totals and percentages onto the manual slice", () => {
    const result = spendingForMode(categories, "manual");

    expect(result[0]).toMatchObject({
      category: "Hardware",
      totalSpentStroops: "10000000",
      percentageOfTotal: 33.3,
    });
    expect(result[1]).toMatchObject({
      category: "Services",
      totalSpentStroops: "20000000",
      percentageOfTotal: 66.7,
    });
  });

  it("keeps the autonomous/manual split intact while filtering", () => {
    const result = spendingForMode(categories, "autonomous");
    expect(result[0]).toMatchObject({
      autonomousSpendStroops: "30000000",
      manualSpendStroops: "10000000",
    });
  });
});
