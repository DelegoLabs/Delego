"use client";

import { Button } from "@delego/ui";

export interface ApprovalsBulkBarProps {
  selectedCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onApprove: () => void;
  onReject: () => void;
}

/** Rendered as a sibling above the virtualized scroll region — never a virtual row itself, so scrolling never affects it */
export function ApprovalsBulkBar({
  selectedCount,
  allSelected,
  onToggleSelectAll,
  onApprove,
  onReject,
}: ApprovalsBulkBarProps) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.5rem 1rem",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderTopLeftRadius: "0.5rem",
        borderTopRightRadius: "0.5rem",
      }}
    >
      <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} aria-label="Select all approvals" />
      <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
        {selectedCount > 0 ? `${selectedCount} selected` : "Select all"}
      </span>
      <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
        <Button variant="primary" disabled={selectedCount === 0} onClick={onApprove}>
          Approve
        </Button>
        <Button variant="secondary" disabled={selectedCount === 0} onClick={onReject}>
          Reject
        </Button>
      </div>
    </div>
  );
}
