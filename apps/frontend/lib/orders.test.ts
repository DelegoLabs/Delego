import { describe, it, expect } from "vitest";
import type { Order, OrderStatus } from "@delegolabs/types";
import {
  HIGH_VALUE_THRESHOLD_STROOPS,
  filterOrders,
  formatXlm,
  isHighValue,
  isTerminal,
  lifecycleIndex,
  needsApproval,
  orderStatusLabel,
  orderToTimelineEvents,
  paginate,
  sortOrders,
  sumOrderTotals,
} from "./orders";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId: "user-1",
    delegationId: "del-1",
    merchantId: "merchant-1",
    status: "draft",
    lineItems: [],
    totalStroops: 10_000_000n,
    escrowContractId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("formatXlm", () => {
  it("converts stroops to XLM with two decimals", () => {
    expect(formatXlm(10_000_000n)).toBe("1.00");
    expect(formatXlm(15_000_000n)).toBe("1.50");
    expect(formatXlm(0n)).toBe("0.00");
  });
});

describe("orderStatusLabel", () => {
  it("humanizes status keys", () => {
    expect(orderStatusLabel("pending_approval")).toBe("Pending approval");
    expect(orderStatusLabel("settled")).toBe("Settled");
  });
});

describe("lifecycleIndex", () => {
  it("returns position for happy-path states and -1 for off-path", () => {
    expect(lifecycleIndex("draft")).toBe(0);
    expect(lifecycleIndex("settled")).toBe(5);
    expect(lifecycleIndex("cancelled")).toBe(-1);
    expect(lifecycleIndex("disputed")).toBe(-1);
  });
});

describe("isTerminal", () => {
  it.each<[OrderStatus, boolean]>([
    ["settled", true],
    ["cancelled", true],
    ["disputed", true],
    ["escrowed", false],
    ["draft", false],
  ])("%s -> %s", (status, expected) => {
    expect(isTerminal(makeOrder({ status }))).toBe(expected);
  });
});

describe("isHighValue / needsApproval", () => {
  it("flags orders at or above the threshold", () => {
    expect(
      isHighValue(makeOrder({ totalStroops: HIGH_VALUE_THRESHOLD_STROOPS }))
    ).toBe(true);
    expect(
      isHighValue(
        makeOrder({ totalStroops: HIGH_VALUE_THRESHOLD_STROOPS - 1n })
      )
    ).toBe(false);
  });

  it("needsApproval requires pending_approval AND high value", () => {
    const highPending = makeOrder({
      status: "pending_approval",
      totalStroops: HIGH_VALUE_THRESHOLD_STROOPS,
    });
    const lowPending = makeOrder({
      status: "pending_approval",
      totalStroops: 1n,
    });
    const highApproved = makeOrder({
      status: "approved",
      totalStroops: HIGH_VALUE_THRESHOLD_STROOPS,
    });
    expect(needsApproval(highPending)).toBe(true);
    expect(needsApproval(lowPending)).toBe(false);
    expect(needsApproval(highApproved)).toBe(false);
  });
});

describe("filterOrders", () => {
  const orders = [
    makeOrder({
      id: "a",
      status: "draft",
      merchantId: "acme",
      totalStroops: 5_000_000n,
    }),
    makeOrder({
      id: "b",
      status: "settled",
      merchantId: "globex",
      totalStroops: 50_000_000n,
    }),
    makeOrder({
      id: "c",
      status: "settled",
      merchantId: "acme",
      totalStroops: 20_000_000n,
    }),
  ];

  it("returns all orders when no filters set", () => {
    expect(filterOrders(orders, {})).toHaveLength(3);
  });

  it("filters by status", () => {
    const result = filterOrders(orders, { statuses: ["settled"] });
    expect(result.map((o) => o.id)).toEqual(["b", "c"]);
  });

  it("filters by case-insensitive search across id and merchant", () => {
    expect(filterOrders(orders, { search: "ACME" }).map((o) => o.id)).toEqual([
      "a",
      "c",
    ]);
    expect(filterOrders(orders, { search: "b" }).map((o) => o.id)).toEqual([
      "b",
    ]);
  });

  it("filters by min/max total", () => {
    expect(
      filterOrders(orders, { minTotalStroops: 20_000_000n }).map((o) => o.id)
    ).toEqual(["b", "c"]);
    expect(
      filterOrders(orders, { maxTotalStroops: 20_000_000n }).map((o) => o.id)
    ).toEqual(["a", "c"]);
  });

  it("combines filters (AND semantics)", () => {
    const result = filterOrders(orders, {
      statuses: ["settled"],
      search: "acme",
    });
    expect(result.map((o) => o.id)).toEqual(["c"]);
  });
});

describe("sortOrders", () => {
  const orders = [
    makeOrder({
      id: "a",
      totalStroops: 30n,
      createdAt: new Date("2026-01-03"),
    }),
    makeOrder({
      id: "b",
      totalStroops: 10n,
      createdAt: new Date("2026-01-01"),
    }),
    makeOrder({
      id: "c",
      totalStroops: 20n,
      createdAt: new Date("2026-01-02"),
    }),
  ];

  it("sorts by total descending / ascending without mutating input", () => {
    const original = orders.map((o) => o.id);
    expect(sortOrders(orders, "totalStroops", "desc").map((o) => o.id)).toEqual(
      ["a", "c", "b"]
    );
    expect(sortOrders(orders, "totalStroops", "asc").map((o) => o.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(orders.map((o) => o.id)).toEqual(original);
  });

  it("sorts by date", () => {
    expect(sortOrders(orders, "createdAt", "asc").map((o) => o.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it("returns the requested page", () => {
    const result = paginate(items, 2, 10);
    expect(result.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(3);
    expect(result.totalItems).toBe(25);
  });

  it("clamps out-of-range pages into bounds", () => {
    expect(paginate(items, 99, 10).page).toBe(3);
    expect(paginate(items, 0, 10).page).toBe(1);
  });

  it("handles an empty list with a single page", () => {
    const result = paginate([], 1, 10);
    expect(result.items).toEqual([]);
    expect(result.totalPages).toBe(1);
  });
});

describe("sumOrderTotals", () => {
  it("sums stroops across orders", () => {
    expect(
      sumOrderTotals([
        makeOrder({ totalStroops: 100n }),
        makeOrder({ totalStroops: 250n }),
      ])
    ).toBe(350n);
    expect(sumOrderTotals([])).toBe(0n);
  });
});

describe("orderToTimelineEvents", () => {
  const createdAt = new Date("2026-01-01T00:00:00Z");
  const updatedAt = new Date("2026-01-03T00:00:00Z");

  it("renders on-path steps in lifecycle order, up to and including the current step", () => {
    const order = makeOrder({ status: "escrowed", createdAt, updatedAt });
    const events = orderToTimelineEvents(order);
    expect(events.map((e) => e.type)).toEqual([
      "draft",
      "pending_approval",
      "approved",
      "escrowed",
    ]);
  });

  it("marks completed steps success and the current in-progress step pending", () => {
    const order = makeOrder({ status: "escrowed", createdAt, updatedAt });
    const events = orderToTimelineEvents(order);
    expect(events.map((e) => e.tone)).toEqual([
      "success",
      "success",
      "success",
      "pending",
    ]);
  });

  it("marks the final step success (not pending) once the order is settled", () => {
    const order = makeOrder({ status: "settled", createdAt, updatedAt });
    const events = orderToTimelineEvents(order);
    expect(events[events.length - 1].tone).toBe("success");
  });

  it("timestamps completed steps at createdAt and the current step at updatedAt", () => {
    const order = makeOrder({ status: "approved", createdAt, updatedAt });
    const events = orderToTimelineEvents(order);
    expect(events[0].timestamp).toEqual(createdAt);
    expect(events[events.length - 1].timestamp).toEqual(updatedAt);
  });

  it("renders off-path terminal states as creation plus a failed terminal event", () => {
    const order = makeOrder({ status: "cancelled", createdAt, updatedAt });
    const events = orderToTimelineEvents(order);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "draft",
      tone: "success",
      timestamp: createdAt,
    });
    expect(events[1]).toMatchObject({
      type: "cancelled",
      tone: "failed",
      timestamp: updatedAt,
    });
  });

  it("renders disputed the same way as cancelled", () => {
    const order = makeOrder({ status: "disputed", createdAt, updatedAt });
    const events = orderToTimelineEvents(order);
    expect(events[1]).toMatchObject({ type: "disputed", tone: "failed" });
  });

  it("appends a distinct note event when the order carries an approvalNote (#573)", () => {
    const order = makeOrder({
      status: "approved",
      createdAt,
      updatedAt,
      approvalNote: "Substitute store brand",
    });
    const events = orderToTimelineEvents(order);
    const noteEvent = events[events.length - 1];
    expect(noteEvent).toMatchObject({
      type: "approval_note",
      tone: "note",
      description: "Substitute store brand",
      timestamp: updatedAt,
    });
  });

  it("omits the note event entirely when the order has no approvalNote", () => {
    const order = makeOrder({ status: "approved", createdAt, updatedAt });
    const events = orderToTimelineEvents(order);
    expect(events.some((e) => e.type === "approval_note")).toBe(false);
  });
});
