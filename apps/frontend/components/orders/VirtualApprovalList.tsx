"use client";

/**
 * VirtualApprovalList (Issue 4)
 *
 * Renders the pending-approvals queue with @tanstack/react-virtual so DOM
 * node count is bounded to ~visible + overscan rows regardless of queue depth.
 *
 * ─── Design decisions ────────────────────────────────────────────────────────
 *
 * Fixed row height (APPROVAL_ROW_HEIGHT_PX):
 *   Using a fixed size avoids the virtualizer needing to measure every row,
 *   which is the primary cause of jank. ApprovalCard has a bounded layout
 *   that fits within 200 px; adjust the constant if the design changes.
 *
 * Logical focus, not DOM focus:
 *   `focusedIndex` is an integer into the full `queue` array. When j/k moves
 *   focus to a row that is currently unmounted (outside the virtual window),
 *   `scrollToIndex` brings it into view first; the row mounts and the ref
 *   callback attaches, after which the parent page's focus-ring effect fires.
 *
 * Selection keyed by Order.id:
 *   `selectedIds` is a Set<string>. When a row unmounts and remounts during
 *   scroll, its selection state is restored from the set lookup — nothing is
 *   lost.
 *
 * Sticky select-all bar:
 *   Lives outside the virtual scroll container (above it), so it is completely
 *   unaffected by the virtualizer.
 *
 * Relation to cursor pagination:
 *   This component is purely a rendering concern. The caller appends new pages
 *   to `queue` as they arrive (e.g. via an "Load more" button or an
 *   intersection observer). The virtualizer gains rows automatically; it never
 *   fetches data itself.
 */

import {
  useCallback,
  useEffect,
  useRef,
} from "react";
import type { Order, RejectionReasonCode } from "@delegolabs/types";
import {
  useVirtualApprovalList,
  APPROVAL_ROW_HEIGHT_PX,
} from "../../hooks/useVirtualApprovalList";
import { useVirtualApprovalHotkeys } from "../../hooks/useVirtualApprovalHotkeys";
import { ApprovalCard } from "./ApprovalCard";
import { HotkeyCheatSheet } from "./HotkeyCheatSheet";
import { UndoSnackbar } from "./UndoSnackbar";

// ─── Container height ─────────────────────────────────────────────────────────
// Use the viewport minus a reasonable header height. This drives the
// virtualizer's window calculation without a ResizeObserver (which would add
// complexity). For production, replace with a ResizeObserver if the shell
// layout height is dynamic.
const CONTAINER_HEIGHT_PX = 680;

export interface VirtualApprovalListProps {
  queue: Order[];
  pendingIds: Set<string>;
  pendingOfflineIds: Set<string>;
  onApprove: (id: string) => Promise<unknown>;
  onReject: (id: string, reason?: string, reasonCode?: RejectionReasonCode) => Promise<unknown>;
  onOpenDrawer: (id: string) => void;
  drawerOpen: boolean;
}

export function VirtualApprovalList({
  queue,
  pendingIds,
  pendingOfflineIds,
  onApprove,
  onReject,
  onOpenDrawer,
  drawerOpen,
}: VirtualApprovalListProps) {
  // ── Virtual list state ─────────────────────────────────────────────────────
  const {
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
  } = useVirtualApprovalList({
    items: queue,
    containerHeightPx: CONTAINER_HEIGHT_PX,
  });

  // Row DOM refs — only populated for currently-mounted virtual rows.
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // When focusedIndex changes (via j/k), focus the DOM node if it's mounted.
  useEffect(() => {
    if (focusedIndex === null) return;
    const item = queue[focusedIndex];
    if (!item) return;
    rowRefs.current.get(item.id)?.focus();
  }, [focusedIndex, queue]);

  // ── Hotkeys (index-based) ──────────────────────────────────────────────────
  const handleApproveByIndex = useCallback(
    (index: number) => {
      const item = queue[index];
      if (item) return onApprove(item.id);
    },
    [queue, onApprove]
  );

  const handleRejectByIndex = useCallback(
    (index: number) => {
      const item = queue[index];
      if (item) return onReject(item.id);
    },
    [queue, onReject]
  );

  const handleOpenDrawerByIndex = useCallback(
    (index: number) => {
      const item = queue[index];
      if (item) onOpenDrawer(item.id);
    },
    [queue, onOpenDrawer]
  );

  const { showCheatSheet, setShowCheatSheet, undoAction, dismissUndo } =
    useVirtualApprovalHotkeys({
      itemCount: queue.length,
      focusedIndex,
      scrollToIndex,
      onApprove: handleApproveByIndex,
      onReject: handleRejectByIndex,
      onOpenDrawer: handleOpenDrawerByIndex,
      disabled: drawerOpen,
    });

  if (queue.length === 0) {
    return (
      <div className="card">
        <p>All caught up — no high-value orders are awaiting approval.</p>
      </div>
    );
  }

  return (
    <>
      {/* ── Sticky select-all bar — lives OUTSIDE the scroll container ── */}
      <div
        role="toolbar"
        aria-label="Bulk approval actions"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.5rem 0",
          background: "var(--color-bg-primary, #f9fafb)",
          borderBottom: "1px solid var(--color-border, #e5e7eb)",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            aria-label={
              isAllSelected ? "Deselect all approvals" : "Select all approvals"
            }
            checked={isAllSelected}
            onChange={() => (isAllSelected ? clearSelection() : selectAll())}
          />
          {isAllSelected
            ? `Deselect all (${queue.length})`
            : `Select all (${queue.length})`}
        </label>

        {selectedIds.size > 0 && (
          <span style={{ fontSize: "0.8125rem", color: "var(--color-text-muted, #6b7280)" }}>
            {selectedIds.size} selected
          </span>
        )}

        <button
          type="button"
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "0.8125rem",
            color: "var(--color-text-muted, #6b7280)",
          }}
          onClick={() => setShowCheatSheet(true)}
          aria-label="Show keyboard shortcuts"
        >
          Keyboard shortcuts (?)
        </button>
      </div>

      {/* ── Virtual scroll container ── */}
      <div
        ref={scrollContainerRef}
        data-testid="virtual-approval-scroll"
        style={{
          height: CONTAINER_HEIGHT_PX,
          overflowY: "auto",
          // Hardware-accelerated scroll for 60 fps
          willChange: "scroll-position",
          // Contain paint so the browser knows nothing outside this rect needs
          // repaint on scroll — key to smooth performance with many rows.
          contain: "strict",
        }}
      >
        {/* Inner div: total height so the browser renders a correct scrollbar. */}
        <div style={{ height: totalSize, position: "relative" }}>
          {virtualRows.map((virtualRow) => {
            const item = queue[virtualRow.index];
            if (!item) return null;

            const isFocused = virtualRow.index === focusedIndex;

            return (
              <div
                key={virtualRow.key}
                data-testid={`virtual-row-${virtualRow.index}`}
                data-index={virtualRow.index}
                ref={(el) => {
                  if (el) rowRefs.current.set(item.id, el);
                  else rowRefs.current.delete(item.id);
                }}
                tabIndex={-1}
                className={`approval-row${isFocused ? " is-focused" : ""}`}
                onFocus={() => setFocusedIndex(virtualRow.index)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  // translateY positions the row — no top/height changes that
                  // would force layout, keeping the scroll path GPU-only.
                  transform: `translateY(${virtualRow.start}px)`,
                  height: APPROVAL_ROW_HEIGHT_PX,
                  // Padding so ApprovalCard doesn't clip at the row boundary.
                  paddingBottom: "0.75rem",
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.5rem",
                }}
              >
                {/* Row-level checkbox — selection keyed by id, survives remount */}
                <input
                  type="checkbox"
                  aria-label={`Select order ${item.id}`}
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelected(item.id)}
                  style={{ marginTop: "1rem", flexShrink: 0 }}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <ApprovalCard
                    order={item}
                    pending={pendingIds.has(item.id)}
                    pendingOffline={pendingOfflineIds.has(item.id)}
                    onApprove={onApprove}
                    onReject={onReject}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showCheatSheet && (
        <HotkeyCheatSheet onClose={() => setShowCheatSheet(false)} />
      )}
      <UndoSnackbar action={undoAction} onDismiss={dismissUndo} />
    </>
  );
}
