import { describe, it, expect } from "vitest";
import {
  EXPIRED_MESSAGE,
  SELF_SIGN_BLOCKED_MESSAGE,
  WALLET_REQUIRED_MESSAGE,
  activePendingApprovals,
  adaptPendingApproval,
  adaptPendingApprovals,
  canSignPendingApproval,
  formatDuration,
  formatExpiryLabel,
  isPendingApprovalExpired,
  msUntilExpiry,
  pendingApprovalCount,
  pendingApprovalUrgency,
  sortPendingApprovals,
  totalPendingAmountStroops,
  type PendingApprovalItem,
} from "./pendingApprovals";

const NOW = new Date("2026-09-24T12:00:00Z");

function item(overrides: Partial<PendingApprovalItem> = {}): PendingApprovalItem {
  return {
    orderId: "ord_1",
    requestedBy: "GA",
    amountStroops: 1_000n,
    recipient: "GB",
    expiresAt: new Date("2026-09-24T18:00:00Z"),
    ...overrides,
  };
}

function dto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    orderId: "ord_1",
    requestedBy: "GA",
    amountStroops: "15000000000",
    recipient: "GB",
    expiresAt: "2026-09-24T18:00:00.000Z",
    ...overrides,
  };
}

describe("adaptPendingApproval", () => {
  it("adapts the wire shape (string stroops, ISO expiry) to the domain shape", () => {
    const adapted = adaptPendingApproval(dto());
    expect(adapted).toEqual({
      orderId: "ord_1",
      requestedBy: "GA",
      amountStroops: 15_000_000_000n,
      recipient: "GB",
      expiresAt: new Date("2026-09-24T18:00:00.000Z"),
    });
  });

  it("accepts a numeric stroop amount as well as a string", () => {
    expect(adaptPendingApproval(dto({ amountStroops: 42 }))?.amountStroops).toBe(42n);
  });

  it("returns null for rows missing required fields or with unparseable values", () => {
    expect(adaptPendingApproval(null)).toBeNull();
    expect(adaptPendingApproval(dto({ orderId: "" }))).toBeNull();
    expect(adaptPendingApproval(dto({ requestedBy: 7 }))).toBeNull();
    expect(adaptPendingApproval(dto({ recipient: undefined }))).toBeNull();
    expect(adaptPendingApproval(dto({ amountStroops: "not-a-number" }))).toBeNull();
    expect(adaptPendingApproval(dto({ amountStroops: -5 }))).toBeNull();
    expect(adaptPendingApproval(dto({ expiresAt: "not-a-date" }))).toBeNull();
  });

  it("adapts a list, dropping unusable rows instead of failing the whole queue", () => {
    const items = adaptPendingApprovals([dto(), dto({ orderId: "ord_2" }), { junk: true }]);
    expect(items.map((i) => i.orderId)).toEqual(["ord_1", "ord_2"]);
  });

  it("returns an empty queue for non-array payloads", () => {
    expect(adaptPendingApprovals(undefined)).toEqual([]);
    expect(adaptPendingApprovals({ items: [] })).toEqual([]);
  });
});

describe("expiry", () => {
  it("measures the remaining window", () => {
    expect(msUntilExpiry(item(), NOW)).toBe(6 * 60 * 60 * 1000);
    expect(isPendingApprovalExpired(item(), NOW)).toBe(false);
    expect(isPendingApprovalExpired(item({ expiresAt: NOW }), NOW)).toBe(true);
    expect(isPendingApprovalExpired(item({ expiresAt: new Date("2026-09-24T11:00:00Z") }), NOW)).toBe(true);
  });

  it("buckets urgency by how close the window is to closing", () => {
    const at = (iso: string) => pendingApprovalUrgency(item({ expiresAt: new Date(iso) }), NOW);
    expect(at("2026-09-24T11:59:00Z")).toBe("expired");
    expect(at("2026-09-24T12:30:00Z")).toBe("critical");
    expect(at("2026-09-25T06:00:00Z")).toBe("warning");
    expect(at("2026-09-28T12:00:00Z")).toBe("normal");
  });

  it("drops expired rows from the active queue and the badge count", () => {
    const items = [
      item(),
      item({ orderId: "ord_expired", expiresAt: new Date("2026-09-24T11:00:00Z") }),
    ];
    expect(activePendingApprovals(items, NOW).map((i) => i.orderId)).toEqual(["ord_1"]);
    expect(pendingApprovalCount(items, NOW)).toBe(1);
    expect(pendingApprovalCount([], NOW)).toBe(0);
  });

  it("formats durations and expiry labels", () => {
    expect(formatDuration(0)).toBe("under a minute");
    expect(formatDuration(45 * 60_000)).toBe("45m");
    expect(formatDuration(2 * 60 * 60_000 + 15 * 60_000)).toBe("2h 15m");
    expect(formatDuration(26 * 60 * 60_000)).toBe("1d 2h");
    expect(formatDuration(50 * 24 * 60 * 60_000)).toBe("50d");

    expect(formatExpiryLabel(item(), NOW)).toBe("Expires in 6h");
    expect(formatExpiryLabel(item({ expiresAt: new Date("2026-09-24T11:00:00Z") }), NOW)).toBe("Expired");
  });
});

describe("sortPendingApprovals", () => {
  it("orders by soonest expiry, then largest amount, then order id", () => {
    const sorted = sortPendingApprovals([
      item({ orderId: "c", expiresAt: new Date("2026-09-26T12:00:00Z") }),
      item({ orderId: "b", expiresAt: new Date("2026-09-24T13:00:00Z"), amountStroops: 5n }),
      item({ orderId: "a", expiresAt: new Date("2026-09-24T13:00:00Z"), amountStroops: 50n }),
      item({ orderId: "d", expiresAt: new Date("2026-09-24T13:00:00Z"), amountStroops: 50n }),
    ]);
    expect(sorted.map((i) => i.orderId)).toEqual(["a", "d", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const items = [item({ orderId: "b", expiresAt: new Date("2026-09-24T13:00:00Z") }), item()];
    const copy = [...items];
    sortPendingApprovals(items);
    expect(items).toEqual(copy);
  });

  it("sums the value awaiting a signature", () => {
    expect(totalPendingAmountStroops([item({ amountStroops: 10n }), item({ amountStroops: 32n })])).toBe(42n);
    expect(totalPendingAmountStroops([])).toBe(0n);
  });
});

describe("canSignPendingApproval", () => {
  it("lets a different connected signer sign", () => {
    expect(canSignPendingApproval(item(), "GCFOUNDER", NOW)).toEqual({ allowed: true });
  });

  it("requires a connected wallet", () => {
    const check = canSignPendingApproval(item(), null, NOW);
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe(WALLET_REQUIRED_MESSAGE);
  });

  it("never lets the requester countersign their own request", () => {
    const check = canSignPendingApproval(item({ requestedBy: "GA" }), "GA", NOW);
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe(SELF_SIGN_BLOCKED_MESSAGE);
  });

  it("blocks signing once the window has closed", () => {
    const check = canSignPendingApproval(item({ expiresAt: new Date("2026-09-24T11:00:00Z") }), "GCFOUNDER", NOW);
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe(EXPIRED_MESSAGE);
  });
});
