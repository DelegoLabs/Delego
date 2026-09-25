/**
 * Tests for Issue 4: Virtualized Approvals List.
 *
 * Core invariants:
 *  1. Logical focusedIndex traverses the full list — not bounded by DOM window.
 *  2. Selection state (selectedIds Set) survives item list changes (simulates
 *     row unmount/remount: ids that were selected remain selected after the
 *     array reference changes but the same ids are present).
 *  3. selectAll/clearSelection work correctly on a 1000-row fixture.
 *  4. scrollToIndex clamps to valid range.
 *  5. focusedIndex is clamped when items shrink.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVirtualApprovalList, APPROVAL_OVERSCAN } from "./useVirtualApprovalList";
import type { Order } from "@delegolabs/types";

// ─── Fixture helpers ─────────────────────────────────────────────────────────

function makeOrders(count: number): Order[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `order-${i}`,
    merchantId: `merchant-${i}`,
    delegationId: `del-${i}`,
    status: "pending_approval" as const,
    totalStroops: BigInt(1_000_000_000),
    amount: BigInt(1_000_000_000),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lineItems: [],
    items: [],
  } as unknown as Order));
}

// Mock @tanstack/react-virtual — we test the hook's own logic, not the
// virtualizer's scroll arithmetic.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: vi.fn(() => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
    scrollToIndex: vi.fn(),
  })),
}));

const CONTAINER_HEIGHT = 680;

// ─── focusedIndex logic ──────────────────────────────────────────────────────

describe("useVirtualApprovalList — logical focus", () => {
  it("initialises focusedIndex to 0 for a non-empty list", () => {
    const items = makeOrders(10);
    const { result } = renderHook(() =>
      useVirtualApprovalList({ items, containerHeightPx: CONTAINER_HEIGHT })
    );
    expect(result.current.focusedIndex).toBe(0);
  });

  it("initialises focusedIndex to null for empty list", () => {
    const { result } = renderHook(() =>
      useVirtualApprovalList({ items: [], containerHeightPx: CONTAINER_HEIGHT })
    );
    expect(result.current.focusedIndex).toBeNull();
  });

  it("setFocusedIndex updates to any valid index including near list end", () => {
    const items = makeOrders(1000);
    const { result } = renderHook(() =>
      useVirtualApprovalList({ items, containerHeightPx: CONTAINER_HEIGHT })
    );
    act(() => result.current.setFocusedIndex(999));
    expect(result.current.focusedIndex).toBe(999);
  });

  it("clamps focusedIndex when items shrink", () => {
    let items = makeOrders(10);
    const { result, rerender } = renderHook(
      ({ items }) =>
        useVirtualApprovalList({ items, containerHeightPx: CONTAINER_HEIGHT }),
      { initialProps: { items } }
    );

    act(() => result.current.setFocusedIndex(9));
    expect(result.current.focusedIndex).toBe(9);

    // Shrink to 5 items
    items = makeOrders(5);
    rerender({ items });

    expect(result.current.focusedIndex).not.toBeGreaterThan(4);
  });

  it("focusedItem resolves to the item at focusedIndex", () => {
    const items = makeOrders(5);
    const { result } = renderHook(() =>
      useVirtualApprovalList({ items, containerHeightPx: CONTAINER_HEIGHT })
    );
    act(() => result.current.setFocusedIndex(3));
    expect(result.current.focusedItem?.id).toBe("order-3");
  });
});

// ─── Selection state ─────────────────────────────────────────────────────────

describe("useVirtualApprovalList — selection", () => {
  it("toggleSelected adds an id to selectedIds", () => {
    const items = makeOrders(5);
    const { result } = renderHook(() =>
      useVirtualApprovalList({ items, containerHeightPx: CONTAINER_HEIGHT })
    );
    act(() => result.current.toggleSelected("order-2"));
    expect(result.current.selectedIds.has("order-2")).toBe(true);
  });

  it("toggleSelected removes an already-selected id", () => {
    const items = makeOrders(5);
    const { result } = renderHook(() =>
      useVirtualApprovalList({ items, containerHeightPx: CONTAINER_HEIGHT })
    );
    act(() => result.current.toggleSelected("order-2"));
    act(() => result.current.toggleSelected("order-2"));
    expect(result.current.selectedIds.has("order-2")).toBe(false);
  });

  it("selection survives item array reference change (simulates remount)", () => {
    const items = makeOrders(10);
    const { result, rerender } = renderHook(
      ({ items }) =>
        useVirtualApprovalList({ items, containerHeightPx: CONTAINER_HEIGHT }),
      { initialProps: { items } }
    );

    act(() => result.current.toggleSelected("order-4"));
    expect(result.current.selectedIds.has("order-4")).toBe(true);

    // Simulate remount: same ids but new array reference
    rerender({ items: [...items] });
    expect(result.current.selectedIds.has("order-4")).toBe(true);
  });

  it("selectAll selects all item ids", () => {
    const items = makeOrders(1000);
    const { result } = renderHook(() =>
      useVirtualApprovalList({ items, containerHeightPx: CONTAINER_HEIGHT })
    );
    act(() => result.current.selectAll());
    expect(result.current.selectedIds.size).toBe(1000);
    expect(result.current.isAllSelected).toBe(true);
  });

  it("clearSelection removes all selections", () => {
    const items = makeOrders(10);
    const { result } = renderHook(() =>
      useVirtualApprovalList({ items, containerHeightPx: CONTAINER_HEIGHT })
    );
    act(() => result.current.selectAll());
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.isAllSelected).toBe(false);
  });
});

// ─── scrollToIndex ───────────────────────────────────────────────────────────

describe("useVirtualApprovalList — scrollToIndex", () => {
  it("updates focusedIndex to the scrolled-to index", () => {
    const items = makeOrders(100);
    const { result } = renderHook(() =>
      useVirtualApprovalList({ items, containerHeightPx: CONTAINER_HEIGHT })
    );
    act(() => result.current.scrollToIndex(42));
    expect(result.current.focusedIndex).toBe(42);
  });

  it("clamps to 0 when called with negative index", () => {
    const items = makeOrders(10);
    const { result } = renderHook(() =>
      useVirtualApprovalList({ items, containerHeightPx: CONTAINER_HEIGHT })
    );
    act(() => result.current.scrollToIndex(-5));
    expect(result.current.focusedIndex).toBe(0);
  });

  it("clamps to last index when called beyond list end", () => {
    const items = makeOrders(10);
    const { result } = renderHook(() =>
      useVirtualApprovalList({ items, containerHeightPx: CONTAINER_HEIGHT })
    );
    act(() => result.current.scrollToIndex(9999));
    expect(result.current.focusedIndex).toBe(9);
  });
});

// ─── APPROVAL_OVERSCAN documented constant ────────────────────────────────────

describe("APPROVAL_OVERSCAN", () => {
  it("is a positive integer", () => {
    expect(typeof APPROVAL_OVERSCAN).toBe("number");
    expect(APPROVAL_OVERSCAN).toBeGreaterThan(0);
    expect(Number.isInteger(APPROVAL_OVERSCAN)).toBe(true);
  });
});
