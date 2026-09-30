import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { server } from "../mocks/server";
import {
  orderHandlersEmpty,
  orderHandlersError,
  resetOrders,
  seedOrder,
} from "../mocks/handlers";
import { buildPendingApprovalOrder, buildOrder } from "../mocks/fixtures/orders";
import { resetReadModelCacheForTests } from "../lib/readModelCache";
import { usePendingApprovals } from "./usePendingApprovals";

/**
 * usePendingApprovals (#780)
 *
 * The hook derives PendingApprovalItem[] from the order list returned by
 * the API. Only orders in `pending_approval` status should appear.
 */
describe("usePendingApprovals", () => {
  beforeEach(() => {
    resetOrders(0);
    // useOrders hydrates from the IndexedDB read-model cache, which is a
    // module-level singleton — without this, an earlier test's cached order
    // list is served instantly and later assertions race the network fetch.
    resetReadModelCacheForTests();
  });

  it("returns an empty list when no orders are pending", async () => {
    server.use(...orderHandlersEmpty);
    const { result } = renderHook(() => usePendingApprovals());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toHaveLength(0);
    expect(result.current.count).toBe(0);
  });

  it("returns only pending_approval orders as PendingApprovalItems", async () => {
    const pending = buildPendingApprovalOrder(42);
    const nonPending = buildOrder(99, { status: "approved" });
    seedOrder(pending);
    seedOrder(nonPending);

    const { result } = renderHook(() => usePendingApprovals());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].orderId).toBe(pending.id);
    expect(result.current.count).toBe(1);
  });

  it("maps the order fields to PendingApprovalItem correctly", async () => {
    const pending = buildPendingApprovalOrder(7);
    seedOrder(pending);

    const { result } = renderHook(() => usePendingApprovals());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const item = result.current.items[0];
    expect(item.orderId).toBe(pending.id);
    expect(typeof item.amountStroops).toBe("bigint");
    expect(item.amountStroops).toBeGreaterThan(0n);
    expect(typeof item.requestedBy).toBe("string");
    expect(item.requestedBy.length).toBeGreaterThan(0);
    expect(typeof item.recipient).toBe("string");
    expect(item.expiresAt).toBeInstanceOf(Date);
  });

  it("surfaces loading=true before the first fetch completes", () => {
    const { result } = renderHook(() => usePendingApprovals());
    // On the very first render, loading must be true.
    expect(result.current.loading).toBe(true);
  });

  it("surfaces an error string when the API fails", async () => {
    server.use(...orderHandlersError);
    const { result } = renderHook(() => usePendingApprovals());

    // The 500 response is retried with exponential backoff by
    // createRetryingFetch (~750ms+), so allow beyond the 1s default.
    await waitFor(
      () => expect(result.current.loading).toBe(false),
      { timeout: 3_000 }
    );

    expect(result.current.error).toBeTruthy();
    expect(result.current.items).toHaveLength(0);
  });

  it("approve() optimistically adds to pendingIds then clears on resolution", async () => {
    const pending = buildPendingApprovalOrder(5);
    seedOrder(pending);

    const { result } = renderHook(() => usePendingApprovals());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let approvePromise!: Promise<boolean>;

    // Kick off the approve but don't await yet
    await waitFor(() => {
      approvePromise = result.current.approve(pending.id, "GAPPROVER");
    });

    const ok = await approvePromise;
    expect(ok).toBe(true);

    // After resolution pendingIds should be clear
    await waitFor(() =>
      expect(result.current.pendingIds.has(pending.id)).toBe(false)
    );
  });

  it("reject() returns false on a non-existent order", async () => {
    const { result } = renderHook(() => usePendingApprovals());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const ok = await result.current.reject("non-existent-id", "GAPPROVER");
    expect(ok).toBe(false);
  });

  it("count reflects the number of pending items", async () => {
    const p1 = buildPendingApprovalOrder(1);
    const p2 = buildPendingApprovalOrder(2);
    seedOrder(p1);
    seedOrder(p2);

    const { result } = renderHook(() => usePendingApprovals());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.count).toBe(result.current.items.length);
    expect(result.current.count).toBeGreaterThanOrEqual(2);
  });
});
