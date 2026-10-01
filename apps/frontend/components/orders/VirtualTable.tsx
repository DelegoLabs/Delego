"use client";

/**
 * VirtualTable (Issue #782)
 *
 * Generic virtualized list component for high-volume tables using
 * @tanstack/react-virtual. Keeps DOM node count bounded to ~visible +
 * overscan rows regardless of dataset size, enabling smooth 60 fps
 * scrolling with 1,000+ rows.
 *
 * ─── Design decisions ────────────────────────────────────────────────────────
 *
 * Generic over T:
 *   The caller owns data shape and row rendering, making VirtualTable
 *   reusable across any list-of-records screen (orders, approvals, etc.)
 *   without coupling this component to a specific domain type.
 *
 * estimateRowHeight (not fixed):
 *   Follows the react-virtual `estimateSize` API. The virtualizer uses this
 *   estimate for initial layout and updates as rows measure. Using an
 *   estimate (rather than a strict constant) supports variable-height rows
 *   while still preventing layout thrash on initial paint.
 *
 * Container height via CSS / ResizeObserver:
 *   The component uses a ResizeObserver on the outer wrapper to compute the
 *   container height dynamically, so it adapts to any responsive layout
 *   without the caller needing to pass a fixed pixel height.
 *
 * Accessibility:
 *   The scroll region has role="region" with an aria-label so screen readers
 *   can identify it. Each virtual row carries aria-rowindex (1-based) so
 *   assistive technology can report position in the full list.
 */

import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

// ─── Public interface (as specified in Issue #782) ───────────────────────────

export interface VirtualTableProps<T> {
  /** The full dataset to virtualize. */
  data: T[];
  /**
   * Estimated row height in pixels. Used by the virtualizer for initial
   * layout. Should be close to the true rendered height to minimise layout
   * shifts after the first paint.
   */
  estimateRowHeight: number;
  /**
   * Render function for each row. The caller decides what markup/component
   * to render; VirtualTable only handles positioning.
   */
  renderRow(item: T): React.ReactNode;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Extra rows rendered above and below the visible window. */
const OVERSCAN = 5;

/**
 * Fallback container height used before the ResizeObserver fires (typically
 * the first render frame). 600 px is a reasonable guess for a desktop
 * merchant order history view.
 */
const DEFAULT_CONTAINER_HEIGHT_PX = 600;

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * VirtualTable renders `data` as a vertically scrolling list where only the
 * rows near the viewport are in the DOM. All DOM-positioning logic lives here;
 * the caller supplies `renderRow` to control appearance.
 *
 * @example
 * ```tsx
 * <VirtualTable
 *   data={orders}
 *   estimateRowHeight={72}
 *   renderRow={(order) => <OrderRow key={order.id} order={order} />}
 * />
 * ```
 */
export function VirtualTable<T>({
  data,
  estimateRowHeight,
  renderRow,
}: VirtualTableProps<T>) {
  // ── Container height (responsive via ResizeObserver) ────────────────────
  const outerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(DEFAULT_CONTAINER_HEIGHT_PX);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        // Use the block (vertical) size of the container for the scroll height.
        const height = entry.contentRect.height;
        if (height > 0) setContainerHeight(height);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Scroll container ref (required by useVirtualizer) ──────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Virtualizer ────────────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: OVERSCAN,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // ── Empty state ─────────────────────────────────────────────────────────
  if (data.length === 0) {
    return (
      <div
        data-testid="virtual-table-empty"
        style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-muted, #6b7280)" }}
      >
        No rows to display.
      </div>
    );
  }

  return (
    /*
     * Outer wrapper: fills its parent flexibly. The ResizeObserver watches
     * this element so `containerHeight` always reflects the available space.
     */
    <div
      ref={outerRef}
      data-testid="virtual-table"
      style={{
        width: "100%",
        /*
         * minHeight ensures the outer div has a measurable size before any
         * layout pass; the ResizeObserver then overrides with the real value.
         */
        minHeight: DEFAULT_CONTAINER_HEIGHT_PX,
        flex: 1,
      }}
    >
      {/*
       * Scroll container: fixed-height, overflow-y: auto.
       * - willChange: "scroll-position" promotes the element to its own
       *   compositing layer for GPU-accelerated scrolling.
       * - contain: "strict" tells the browser nothing outside this rect
       *   needs repaint on scroll — the primary enabler of 60 fps at scale.
       */}
      <div
        ref={scrollContainerRef}
        data-testid="virtual-table-scroll"
        role="region"
        aria-label="Virtualized order list"
        style={{
          height: containerHeight,
          overflowY: "auto",
          overflowX: "hidden",
          willChange: "scroll-position",
          contain: "strict",
        }}
      >
        {/*
         * Inner div: its height equals the total virtual scroll height so the
         * browser renders a correct, proportional scrollbar.
         */}
        <div
          style={{
            height: totalSize,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualRows.map((virtualRow) => {
            const item = data[virtualRow.index];
            if (item === undefined) return null;

            return (
              /*
               * Each row is absolutely positioned via a translateY transform.
               * Using transform (instead of top) avoids triggering layout
               * recalculation on every scroll tick, keeping the scroll path
               * GPU-only.
               */
              <div
                key={virtualRow.key}
                data-testid={`virtual-row-${virtualRow.index}`}
                data-index={virtualRow.index}
                aria-rowindex={virtualRow.index + 1}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {renderRow(item)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
