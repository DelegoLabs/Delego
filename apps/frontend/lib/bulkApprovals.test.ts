import { describe, it, expect, vi } from "vitest";
import type { Order } from "@delegolabs/types";
import { runBulkApprove, runBulkReject } from "./bulkApprovals";
import * as batchRunner from "./batchRunner";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    delegationId: "del-1",
    status: "pending_approval",
    totalStroops: 2_000n * 10_000_000n, // above the high-value threshold
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("runBulkApprove", () => {
  it("approves every eligible (pending, high-value) order", async () => {
    const orders = [makeOrder({ id: "a" }), makeOrder({ id: "b" })];
    const approve = vi.fn(async (id: string) => makeOrder({ id, status: "approved" }));
    const results = await runBulkApprove(orders, { approve, reject: vi.fn() });

    expect(approve).toHaveBeenCalledTimes(2);
    expect(results.every((r) => r.status === "success")).toBe(true);
  });

  it("skips orders that aren't pending approval, with an inline reason, and never calls approve for them", async () => {
    const orders = [makeOrder({ id: "a" }), makeOrder({ id: "b", status: "approved" })];
    const approve = vi.fn(async (id: string) => makeOrder({ id }));
    const results = await runBulkApprove(orders, { approve, reject: vi.fn() });

    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith("a");
    expect(results[1]).toMatchObject({ status: "skipped", error: "Not pending approval" });
  });

  it("isolates a failing approval so the rest of the batch still completes", async () => {
    const orders = [makeOrder({ id: "a" }), makeOrder({ id: "fail" }), makeOrder({ id: "c" })];
    const approve = vi.fn(async (id: string) => {
      if (id === "fail") throw new Error("gateway timeout");
      return makeOrder({ id });
    });
    const results = await runBulkApprove(orders, { approve, reject: vi.fn() });

    expect(results.map((r) => r.status)).toEqual(["success", "error", "success"]);
    expect(results[1].error).toBe("gateway timeout");
  });

  it("delegates to the shared runBatch utility rather than a bespoke loop", async () => {
    const spy = vi.spyOn(batchRunner, "runBatch");
    const orders = [makeOrder({ id: "a" })];
    await runBulkApprove(orders, { approve: vi.fn(async () => null), reject: vi.fn() }, { concurrency: 3 });
    expect(spy).toHaveBeenCalledWith(orders, expect.any(Function), expect.objectContaining({ concurrency: 3 }));
    spy.mockRestore();
  });
});

describe("runBulkReject", () => {
  it("rejects every eligible order with the given reason", async () => {
    const orders = [makeOrder({ id: "a" }), makeOrder({ id: "b" })];
    const reject = vi.fn(async (id: string, reason?: string) => makeOrder({ id, status: "rejected" }));
    await runBulkReject(orders, { approve: vi.fn(), reject }, "Budget exceeded");

    expect(reject).toHaveBeenCalledWith("a", "Budget exceeded");
    expect(reject).toHaveBeenCalledWith("b", "Budget exceeded");
  });
});
