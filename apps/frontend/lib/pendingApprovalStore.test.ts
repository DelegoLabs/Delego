import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  arePendingApprovalsLoaded,
  getPendingApprovalItems,
  loadPendingApprovalsOnce,
  removePendingApproval,
  resetPendingApprovalStore,
  setPendingApprovalItems,
  subscribeToPendingApprovals,
} from "./pendingApprovalStore";
import type { PendingApprovalItem } from "./pendingApprovals";

function item(orderId: string): PendingApprovalItem {
  return {
    orderId,
    requestedBy: "GA",
    amountStroops: 10n,
    recipient: "GB",
    expiresAt: new Date("2026-09-24T18:00:00Z"),
  };
}

describe("pendingApprovalStore", () => {
  beforeEach(() => {
    resetPendingApprovalStore();
  });

  it("starts empty and unloaded", () => {
    expect(getPendingApprovalItems()).toEqual([]);
    expect(arePendingApprovalsLoaded()).toBe(false);
  });

  it("keeps a stable snapshot identity between writes", () => {
    setPendingApprovalItems([item("ord_1")]);
    const snapshot = getPendingApprovalItems();
    expect(arePendingApprovalsLoaded()).toBe(true);
    expect(getPendingApprovalItems()).toBe(snapshot);
  });

  it("notifies subscribers on write and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToPendingApprovals(listener);

    setPendingApprovalItems([item("ord_1")]);
    expect(listener).toHaveBeenCalledTimes(1);

    removePendingApproval("ord_1");
    expect(getPendingApprovalItems()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setPendingApprovalItems([item("ord_2")]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("removes only the signed order", () => {
    setPendingApprovalItems([item("ord_1"), item("ord_2")]);
    removePendingApproval("ord_1");
    expect(getPendingApprovalItems().map((i) => i.orderId)).toEqual(["ord_2"]);
  });

  it("shares a single in-flight load across concurrent callers", async () => {
    const loader = vi.fn().mockResolvedValue([item("ord_1")]);

    const [a, b] = await Promise.all([
      loadPendingApprovalsOnce(loader),
      loadPendingApprovalsOnce(loader),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(getPendingApprovalItems().map((i) => i.orderId)).toEqual(["ord_1"]);
  });

  it("clears the in-flight slot after a failure so a later load can retry", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([item("ord_1")]);

    await expect(loadPendingApprovalsOnce(loader)).rejects.toThrow("offline");
    // A failed load must not wipe a previously good snapshot.
    expect(getPendingApprovalItems()).toEqual([]);

    await expect(loadPendingApprovalsOnce(loader)).resolves.toHaveLength(1);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
