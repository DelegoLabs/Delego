"use client";

import { Chip, type ChipTone } from "@delego/ui";
import type { Approval } from "@delego/types";
import { stroopsToDisplay } from "@delego/utils/currency";

const STATUS_TONE: Record<Approval["status"], ChipTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

export interface ApprovalRowProps {
  approval: Approval;
  selected: boolean;
  focused: boolean;
  onToggleSelected: () => void;
  onFocus: () => void;
}

export function ApprovalRow({ approval, selected, focused, onToggleSelected, onFocus }: ApprovalRowProps) {
  return (
    <div
      role="row"
      aria-selected={selected}
      data-focused={focused || undefined}
      onClick={onFocus}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        height: "100%",
        padding: "0 1rem",
        borderBottom: "1px solid var(--color-border)",
        background: focused ? "var(--chip-info-bg)" : "var(--color-surface)",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelected}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${approval.title}`}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {approval.title}
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
          Requested by {approval.requestedBy}
        </div>
      </div>
      {approval.amountStroops !== null && <span>{stroopsToDisplay(approval.amountStroops)} XLM</span>}
      <Chip tone={STATUS_TONE[approval.status]}>{approval.status}</Chip>
    </div>
  );
}
