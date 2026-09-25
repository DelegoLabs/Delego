"use client";

/**
 * useVirtualApprovalList (Issue 4)
 *
 * Combines @tanstack/react-virtual row virtualisation with:
 *  - Logical (not DOM-bound) focus index so j/k navigation works across
 *    virtual window edges — rows outside the overscan range are unmounted,
 *    but `focusedIndex` is an integer into the full logical list.
 *  - Selection state keyed by escrow id so it survives row unmount/remount
 *    during scroll.
 *  - A `scrollToIndex` utility so the virtualizer scrolls to bring a
 *    newly-focused row into view when it would otherwise be off-screen.
 *
 * Relation to cursor pagination
 * ──────────────────────────────
 * Virtualisation operates on whatever `items` the caller provides. Cursor
 * pagination is orthogonal: as new pages are appended to `items`, the
 * virtualizer simply gains more rows. The caller is responsible for
 * appending pages and passing the updated array; this hook never fetches.
 *
 * Performance targets (seeded 1000-row fixture):
 *  - DOM node count ≈ visible rows + (2 × overscan) regardless of total.
 *  - 60 fps scroll: fixed ROW_HEIGHT_PX prevents layout thrash.
 *  - No layout reads inside the scroll handler.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Order } from "@delegolabs/types";

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Fixed row height in pixels. Must match the CSS for `.approval-row` in
 * globals.css. A fixed size is intentional — it prevents the virtualizer
 * from needing to measure every row, which is the primary source of jank in
 * large lists.
 */
export const APPROVAL_ROW_HEIGHT_PX = 200;

/** Extra rows rendered above and below the visible window. */
export const APPROVAL_OVERSCAN = 3;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UseVirtualApprovalListOptions {
  /** The full logical list of orders (all loaded pages, already filtered/sorted). */
  items: Order[];
  /** Height of the scrollable container in pixels. */
  containerHeightPx: number;
}

export interface UseVirtualApprovalListResult {
  /** Ref to attach to the scrollable container div. */
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  /**
   * Virtual rows to render. Each has `index`, `start` (top offset px),
   * `size` (height px), and a `key` for React reconciliation.
   */
  virtualRows: ReturnType<ReturnType<typeof useVirtualizer>["getVirtualItems"]>;
  /** Total height of the scroll content area — set as `height` on the inner div. */
  totalSize: number;
  /**
   * Logical index (0-based) of the focused item in `items`.
   * This is NOT a DOM index — it's valid even when the row is outside
   * the virtual window and therefore unmounted.
   */
  focusedIndex: number | null;
  setFocusedIndex: (index: number | null) => void;
  /**
   * Set of selected item IDs. Keyed by Order.id so selection survives
   * rows being unmounted and remounted during scroll.
   */
  selectedIds: Set<string>;
  toggleSelected: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  isAllSelected: boolean;
  /**
   * Scrolls the virtualizer so the given logical index is visible, then
   * updates `focusedIndex`. Call this from j/k hotkey handlers.
   */
  scrollToIndex: (index: number) => void;
  /** The item at focusedIndex, or null. */
  focusedItem: Order | null;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useVirtualApprovalList({
  items,
  containerHeightPx,
}: UseVirtualApprovalListOptions): UseVirtualApprovalListResult {
  const scrollContainerRef = useRef<HTMLDivElement>(null!);

  // ── Virtualizer ────────────────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => APPROVAL_ROW_HEIGHT_PX,
    overscan: APPROVAL_OVERSCAN,
  });

  // ── Logical focus (id-keyed, not DOM-keyed) ────────────────────────────────
  const [focusedIndex, setFocusedIndex] = useState<number | null>(
    items.length > 0 ? 0 : null
  );

  // Keep focusedIndex valid as the item list changes.
  useEffect(() => {
    setFocusedIndex((prev) => {
      if (items.length === 0) return null;
      if (prev === null) return 0;
      return Math.min(prev, items.length - 1);
    });
  }, [items.length]);

  // ── Selection (id-keyed, scroll-safe) ─────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((o) => o.id)));
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isAllSelected =
    items.length > 0 && selectedIds.size === items.length;

  // ── scrollToIndex + focus ──────────────────────────────────────────────────
  const scrollToIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, items.length - 1));
      virtualizer.scrollToIndex(clamped, { align: "auto" });
      setFocusedIndex(clamped);
    },
    [virtualizer, items.length]
  );

  // ── Derived ────────────────────────────────────────────────────────────────
  const focusedItem =
    focusedIndex !== null ? (items[focusedIndex] ?? null) : null;

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return {
    scrollContainerRef,
    virtualRows,
    totalSize,
    focusedIndex,
    setFocusedIndex,
    selectedIds,
    toggleSelected,
    selectAll,
    clearSelection,
    isAllSelected,
    scrollToIndex,
    focusedItem,
  };
}
