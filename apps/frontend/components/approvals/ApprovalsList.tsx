"use client";

import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Approval } from "@delego/types";
import { useApprovalSelection } from "../../hooks/useApprovalSelection";
import { useApprovalHotkeys } from "../../hooks/useApprovalHotkeys";
import { ApprovalRow } from "./ApprovalRow";
import { ApprovalsBulkBar } from "./ApprovalsBulkBar";

const ROW_HEIGHT = 56;
const OVERSCAN = 8;
const VIEWPORT_HEIGHT = 480;

export interface ApprovalsListProps {
  approvals: Approval[];
  onBulkApprove?: (ids: string[]) => void;
  onBulkReject?: (ids: string[]) => void;
}

export function ApprovalsList({ approvals, onBulkApprove, onBulkReject }: ApprovalsListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const selection = useApprovalSelection();

  const virtualizer = useVirtualizer({
    count: approvals.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    // Gives the virtualizer a sane size before ResizeObserver reports the real one (also
    // needed under jsdom in tests, which never reports a nonzero layout size on its own).
    initialRect: { width: 0, height: VIEWPORT_HEIGHT },
  });

  useApprovalHotkeys({
    itemCount: approvals.length,
    setFocusedIndex,
    onToggleFocused: () => {
      const row = approvals[focusedIndex];
      if (row) selection.toggle(row.id);
    },
  });

  // Keep the focused row scrolled into view even when the virtualizer hasn't mounted it yet —
  // this is what makes j/k keep working across virtual window edges.
  useEffect(() => {
    virtualizer.scrollToIndex(focusedIndex, { align: "auto" });
  }, [focusedIndex, virtualizer]);

  const allIds = approvals.map((a) => a.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selection.isSelected(id));

  return (
    <div>
      <ApprovalsBulkBar
        selectedCount={selection.count}
        allSelected={allSelected}
        onToggleSelectAll={() => (allSelected ? selection.clear() : selection.selectAll(allIds))}
        onApprove={() => onBulkApprove?.(Array.from(selection.selected))}
        onReject={() => onBulkReject?.(Array.from(selection.selected))}
      />
      <div
        ref={parentRef}
        data-testid="approvals-scroll-container"
        style={{
          height: `${VIEWPORT_HEIGHT}px`,
          overflow: "auto",
          border: "1px solid var(--color-border)",
          borderTop: "none",
          borderBottomLeftRadius: "0.5rem",
          borderBottomRightRadius: "0.5rem",
        }}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const approval = approvals[virtualRow.index];
            return (
              <div
                key={approval.id}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ApprovalRow
                  approval={approval}
                  selected={selection.isSelected(approval.id)}
                  focused={virtualRow.index === focusedIndex}
                  onToggleSelected={() => selection.toggle(approval.id)}
                  onFocus={() => setFocusedIndex(virtualRow.index)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
