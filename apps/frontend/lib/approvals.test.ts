import { describe, it, expect } from "vitest";
import type { Order } from "@delegolabs/types";
import {
  SLA_WARNING_HOURS,
  SLA_CRITICAL_HOURS,
  STALE_DIGEST_THRESHOLD_HOURS,
  APPROVAL_DECISIONS_CSV_HEADER,
  approvalDecisionsToCsv,
  countStaleApprovals,
  decisionTypeForStatus,
  deriveApprovalDecisions,
  filterApprovalDecisions,
  formatApprovalAge,
  getApprovalAgeMs,
  getApprovalUrgency,
  hasActiveHistoryFilters,
  uniqueAgentIds,
  uniqueDelegationIds,
} from "./approvals";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId: "user-1",
    delegationId: "del-1",
    merchantId: "merchant-1",
    status: "pending_approval",
    lineItems: [],
    totalStroops: 2_000n * 10_000_000n, // above the high-value threshold
    escrowContractId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("getApprovalAgeMs", () => {
  it("computes elapsed time via UTC epoch millis, independent of timezone", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-01-01T05:00:00Z");
    expect(getApprovalAgeMs(createdAt, now)).toBe(5 * 3_600_000);
  });

  it("agrees on age regardless of the reader's local timezone rendering the same instants", () => {
    // Two Date objects that are the same instant but written with different
    // offsets — epoch-millis math must be unaffected by how they're printed.
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const createdAtLocalOffset = new Date("2026-01-01T02:00:00.000+02:00");
    expect(createdAt.getTime()).toBe(createdAtLocalOffset.getTime());

    const now = new Date("2026-01-02T00:00:00.000Z");
    expect(getApprovalAgeMs(createdAt, now)).toBe(
      getApprovalAgeMs(createdAtLocalOffset, now)
    );
  });

  it("never returns a negative age for clock skew where now < createdAt", () => {
    const createdAt = new Date("2026-01-02T00:00:00Z");
    const now = new Date("2026-01-01T00:00:00Z"); // clock skew: "now" before "createdAt"
    expect(getApprovalAgeMs(createdAt, now)).toBe(0);
  });
});

describe("formatApprovalAge", () => {
  it("formats sub-minute ages as 'just now'", () => {
    expect(formatApprovalAge(30_000)).toBe("just now");
  });

  it("formats minutes", () => {
    expect(formatApprovalAge(42 * 60_000)).toBe("42m");
  });

  it("formats hours", () => {
    expect(formatApprovalAge(5 * 3_600_000)).toBe("5h");
  });

  it("formats days once past 24 hours", () => {
    expect(formatApprovalAge(3 * 24 * 3_600_000)).toBe("3d");
  });
});

describe("getApprovalUrgency", () => {
  it("is normal below the warning threshold", () => {
    expect(getApprovalUrgency((SLA_WARNING_HOURS - 1) * 3_600_000)).toBe(
      "normal"
    );
  });

  it("is warning at/after the warning threshold and before critical", () => {
    expect(getApprovalUrgency(SLA_WARNING_HOURS * 3_600_000)).toBe("warning");
    expect(getApprovalUrgency((SLA_CRITICAL_HOURS - 1) * 3_600_000)).toBe(
      "warning"
    );
  });

  it("is critical at/after the critical threshold", () => {
    expect(getApprovalUrgency(SLA_CRITICAL_HOURS * 3_600_000)).toBe("critical");
  });

  it("respects custom thresholds", () => {
    expect(getApprovalUrgency(2 * 3_600_000, 1, 3)).toBe("warning");
    expect(getApprovalUrgency(4 * 3_600_000, 1, 3)).toBe("critical");
  });
});

describe("countStaleApprovals", () => {
  const now = new Date("2026-01-10T00:00:00Z");

  it("counts only pending-approval, high-value orders older than the threshold", () => {
    const orders = [
      makeOrder({ id: "old-1", createdAt: new Date("2026-01-01T00:00:00Z") }), // 9 days old
      makeOrder({ id: "recent", createdAt: new Date("2026-01-09T12:00:00Z") }), // 12h old
      makeOrder({
        id: "old-but-not-high-value",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        totalStroops: 1n,
      }),
      makeOrder({
        id: "old-but-approved",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        status: "approved",
      }),
    ];
    expect(countStaleApprovals(orders, now, STALE_DIGEST_THRESHOLD_HOURS)).toBe(
      1
    );
  });

  it("returns 0 when nothing is stale", () => {
    const orders = [makeOrder({ createdAt: new Date("2026-01-09T23:00:00Z") })];
    expect(countStaleApprovals(orders, now)).toBe(0);
  });
});

/* --- Approval history (#568) ------------------------------------------------ */

function decidedOrder(overrides: Partial<Order> = {}): Order {
  return makeOrder({
    status: "approved",
    updatedAt: new Date("2026-02-01T12:00:00Z"),
    ...overrides,
  });
}

describe("decisionTypeForStatus", () => {
  it("maps happy-path statuses to 'approved'", () => {
    for (const status of ["approved", "escrowed", "fulfilled", "settled", "completed"] as const) {
      expect(decisionTypeForStatus(status)).toBe("approved");
    }
  });

  it("maps rejection / fallout statuses to 'rejected'", () => {
    for (const status of ["rejected", "cancelled", "canceled", "disputed", "failed"] as const) {
      expect(decisionTypeForStatus(status)).toBe("rejected");
    }
  });

  it("returns null while the order is still awaiting a decision", () => {
    for (const status of ["draft", "pending", "pending_approval", "awaiting_countersign"] as const) {
      expect(decisionTypeForStatus(status)).toBeNull();
    }
  });
});

describe("deriveApprovalDecisions", () => {
  it("skips orders with no decision yet", () => {
    const records = deriveApprovalDecisions([
      makeOrder({ id: "open", status: "pending_approval" }),
      decidedOrder({ id: "done" }),
    ]);
    expect(records.map((r) => r.orderId)).toEqual(["done"]);
  });

  it("orders newest decision first", () => {
    const records = deriveApprovalDecisions([
      decidedOrder({ id: "a", updatedAt: new Date("2026-02-01T00:00:00Z") }),
      decidedOrder({ id: "b", updatedAt: new Date("2026-03-01T00:00:00Z") }),
      decidedOrder({ id: "c", updatedAt: new Date("2026-01-01T00:00:00Z") }),
    ]);
    expect(records.map((r) => r.orderId)).toEqual(["b", "a", "c"]);
  });

  it("captures the rejection reason only for rejected orders", () => {
    const [rejected, approved] = deriveApprovalDecisions([
      decidedOrder({ id: "r", status: "rejected", rejectionReason: "over budget" }),
      decidedOrder({ id: "a", rejectionReason: "ignored for approvals" }),
    ]);
    expect(rejected.reason).toBe("over budget");
    expect(approved.reason).toBeNull();
  });

  it("resolves the agent id from the delegation lookup when provided", () => {
    const [record] = deriveApprovalDecisions(
      [decidedOrder({ delegationId: "del-9" })],
      { agentByDelegationId: new Map([["del-9", "agent-42"]]) }
    );
    expect(record.agentId).toBe("agent-42");
  });

  it("leaves agent id null when there is no lookup entry", () => {
    const [record] = deriveApprovalDecisions([decidedOrder({ delegationId: "del-x" })]);
    expect(record.agentId).toBeNull();
  });

  it("summarizes the first line item, with a count of the rest", () => {
    const [record] = deriveApprovalDecisions([
      decidedOrder({
        lineItems: [
          { productId: "widget", quantity: 3 },
          { productId: "gadget", quantity: 1 },
        ],
      }),
    ]);
    expect(record.item).toBe("widget×3 +1 more");
  });

  it("falls back to the merchant id when there are no line items", () => {
    const [record] = deriveApprovalDecisions([
      decidedOrder({ lineItems: [], merchantId: "merchant-7" }),
    ]);
    expect(record.item).toBe("merchant-7");
  });
});

describe("filterApprovalDecisions", () => {
  const records = deriveApprovalDecisions([
    decidedOrder({ id: "a", status: "approved", delegationId: "del-1", updatedAt: new Date("2026-02-01T00:00:00Z") }),
    decidedOrder({ id: "b", status: "rejected", delegationId: "del-2", updatedAt: new Date("2026-02-10T00:00:00Z") }),
    decidedOrder({ id: "c", status: "settled", delegationId: "del-1", updatedAt: new Date("2026-02-20T00:00:00Z") }),
  ], { agentByDelegationId: new Map([["del-1", "agent-1"], ["del-2", "agent-2"]]) });

  it("returns everything when no filter is set", () => {
    expect(filterApprovalDecisions(records, {})).toHaveLength(3);
  });

  it("filters by decision type", () => {
    expect(filterApprovalDecisions(records, { decision: "rejected" }).map((r) => r.orderId)).toEqual(["b"]);
  });

  it("filters by agent and by delegation", () => {
    expect(filterApprovalDecisions(records, { agentId: "agent-1" }).map((r) => r.orderId).sort()).toEqual(["a", "c"]);
    expect(filterApprovalDecisions(records, { delegationId: "del-2" }).map((r) => r.orderId)).toEqual(["b"]);
  });

  it("applies an inclusive date range", () => {
    const out = filterApprovalDecisions(records, {
      from: new Date("2026-02-10T00:00:00Z"),
      to: new Date("2026-02-10T23:59:59Z"),
    });
    expect(out.map((r) => r.orderId)).toEqual(["b"]);
  });

  it("composes filters with AND", () => {
    const out = filterApprovalDecisions(records, { decision: "approved", agentId: "agent-1", delegationId: "del-1" });
    expect(out.map((r) => r.orderId).sort()).toEqual(["a", "c"]);
  });
});

describe("history filter helpers", () => {
  it("hasActiveHistoryFilters is false only for an all-empty filter set", () => {
    expect(hasActiveHistoryFilters({})).toBe(false);
    expect(hasActiveHistoryFilters({ decision: "approved" })).toBe(true);
    expect(hasActiveHistoryFilters({ from: new Date() })).toBe(true);
  });

  it("uniqueAgentIds / uniqueDelegationIds return sorted distinct values", () => {
    const records = deriveApprovalDecisions(
      [
        decidedOrder({ id: "a", delegationId: "del-2" }),
        decidedOrder({ id: "b", delegationId: "del-1" }),
        decidedOrder({ id: "c", delegationId: "del-1" }),
      ],
      { agentByDelegationId: new Map([["del-1", "agent-b"], ["del-2", "agent-a"]]) }
    );
    expect(uniqueAgentIds(records)).toEqual(["agent-a", "agent-b"]);
    expect(uniqueDelegationIds(records)).toEqual(["del-1", "del-2"]);
  });
});

describe("approvalDecisionsToCsv", () => {
  it("uses the documented, stable column schema", () => {
    const { header } = approvalDecisionsToCsv([]);
    expect(header).toEqual([...APPROVAL_DECISIONS_CSV_HEADER]);
    expect(header).toEqual([
      "Order ID",
      "Item",
      "Merchant",
      "Amount (XLM)",
      "Decision",
      "Reason",
      "Decided At",
      "Agent",
      "Delegation",
    ]);
  });

  it("emits one row per record with a column for every header", () => {
    const records = deriveApprovalDecisions(
      [decidedOrder({ id: "ord-1", status: "rejected", rejectionReason: "too pricey", delegationId: "del-1" })],
      { agentByDelegationId: new Map([["del-1", "agent-1"]]) }
    );
    const { header, rows } = approvalDecisionsToCsv(records);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(header.length);
    expect(rows[0][0]).toBe("ord-1");
    expect(rows[0][4]).toBe("rejected");
    expect(rows[0][5]).toBe("too pricey");
    expect(rows[0][6]).toBe("2026-02-01T12:00:00.000Z");
    expect(rows[0][7]).toBe("agent-1");
  });
});
