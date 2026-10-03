import { describe, it, expect, beforeEach } from "vitest";
import { server } from "../server";
import { seedOrder, resetOrders, DELEGATION_OWNERS } from "./orders";
import { buildDualControlOrder, capabilitiesHandlersDisabled, capabilitiesHandlersUnavailable, pendingApprovalHandlersEmpty, resetPendingApprovals } from "./approvals";
import { fetchPendingApprovals, submitApproval } from "../../services/approvals";
import { adaptPendingApprovals, pendingApprovalCount } from "../../lib/pendingApprovals";
import { detectDualControlCapability } from "../../services/payments";


describe("dual-control approvals — two-approver MSW journey (#574)", () => {
  beforeEach(() => {
    resetOrders();
  });

  it("completes the full journey: first approval awaits countersign, a different signer completes it", async () => {
    const order = buildDualControlOrder(1, { id: "order-dc-1" });
    seedOrder(order);

    const first = await submitApproval("order-dc-1", DELEGATION_OWNERS[0]);
    expect(first.error).toBeNull();
    expect(first.data?.status).toBe("pending_approval");
    expect(first.data?.dualControl?.status).toBe("awaiting_countersign");
    expect(first.data?.dualControl?.firstApproval?.approverId).toBe(DELEGATION_OWNERS[0]);

    const second = await submitApproval("order-dc-1", DELEGATION_OWNERS[1]);
    expect(second.error).toBeNull();
    expect(second.data?.status).toBe("approved");
    expect(second.data?.dualControl?.status).toBe("completed");
    expect(second.data?.dualControl?.secondApproval?.approverId).toBe(DELEGATION_OWNERS[1]);
  });

  it("rejects a second approval attempt from the same signer with 409 and the self-countersign message", async () => {
    const order = buildDualControlOrder(2, { id: "order-dc-2" });
    seedOrder(order);

    await submitApproval("order-dc-2", DELEGATION_OWNERS[0]);
    const repeat = await submitApproval("order-dc-2", DELEGATION_OWNERS[0]);

    expect(repeat.data).toBeNull();
    expect(repeat.error?.code).toBe("self_countersign_blocked");
    expect(repeat.error?.message).toMatch(/waiting for secondary countersignature/i);
  });

  it("approves immediately, skipping dual control, for orders below the threshold", async () => {
    const order = buildDualControlOrder(3, { id: "order-low-value", totalStroops: 1n });
    seedOrder(order);

    const result = await submitApproval("order-low-value", DELEGATION_OWNERS[0]);
    expect(result.data?.status).toBe("approved");
    expect(result.data?.dualControl).toBeUndefined();
  });

  describe("capability detection fallback", () => {
    it("reports the capability as available under the default (enabled) mock scenario", async () => {
      expect(await detectDualControlCapability()).toBe(true);
    });

    it("falls back to false when the API advertises the capability as off", async () => {
      server.use(...capabilitiesHandlersDisabled);
      expect(await detectDualControlCapability()).toBe(false);
    });

    it("falls back to false when the capability endpoint is unavailable", async () => {
      server.use(...capabilitiesHandlersUnavailable);
      expect(await detectDualControlCapability()).toBe(false);
    });
  });
});

describe("pending-signature queue (#780)", () => {
  beforeEach(() => {
    resetPendingApprovals();
  });

  it("lists the transactions awaiting a secondary signature, adapting the wire shape", async () => {
    const res = await fetchPendingApprovals();
    expect(res.error).toBeNull();

    const items = adaptPendingApprovals(res.data);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toEqual(
      expect.objectContaining({
        orderId: expect.stringContaining("order-pending"),
        amountStroops: expect.any(BigInt),
        expiresAt: expect.any(Date),
      })
    );
  });

  it("counts live rows for the navigation badge, ignoring rows past their window", async () => {
    const items = adaptPendingApprovals((await fetchPendingApprovals()).data);
    const expired = items.filter((i) => i.expiresAt.getTime() <= Date.now());

    expect(expired.length).toBeGreaterThan(0);
    expect(pendingApprovalCount(items)).toBe(items.length - expired.length);
  });

  it("returns an empty queue under the empty scenario", async () => {
    server.use(...pendingApprovalHandlersEmpty);

    const res = await fetchPendingApprovals();
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  });
});
