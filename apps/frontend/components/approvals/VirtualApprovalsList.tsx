"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  ApprovalItem,
  ApprovalKind,
  ApprovalStatus,
} from "@delego/types";
import { Button, Chip, Select } from "@delego/ui";
import { stroopsToDisplay } from "@delego/utils";
import { useApprovalHotkeys } from "../../hooks/useApprovalHotkeys";

const ROW_HEIGHT = 72;
const OVERSCAN = 12;
const CONTAINER_MAX_HEIGHT = 640;

function statusToChipVariant(
  status: ApprovalStatus
): "approval_pending" | "approval_approved" | "approval_rejected" | "info" {
  switch (status) {
    case "PENDING":
      return "approval_pending";
    case "APPROVED":
      return "approval_approved";
    case "REJECTED":
      return "approval_rejected";
    case "ESCALATED":
      return "info";
  }
}

const KIND_LABELS: Record<ApprovalKind, string> = {
  SPEND_LIMIT_EXCEEDED: "Spend limit exceeded",
  DELEGATION_CREATION: "New delegation",
  ESCROW_RELEASE: "Escrow release",
  ESCROW_REFUND: "Escrow refund",
  DISPUTE_RESOLUTION: "Dispute resolution",
};

export interface VirtualApprovalsListProps {
  items: ApprovalItem[];
  loading?: boolean;
  rowHeight?: number;
  overscan?: number;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onBulkApprove?: (ids: string[]) => void;
  onBulkReject?: (ids: string[]) => void;
  onEscalate?: (id: string) => void;
  onRowClick?: (item: ApprovalItem) => void;
  containerHeight?: number;
}

export function VirtualApprovalsList({
  items,
  loading = false,
  rowHeight = ROW_HEIGHT,
  overscan = OVERSCAN,
  onApprove,
  onReject,
  onBulkApprove,
  onBulkReject,
  onEscalate,
  onRowClick,
  containerHeight = CONTAINER_MAX_HEIGHT,
}: VirtualApprovalsListProps) {
  const count = items.length;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: useCallback((idx: number) => items[idx]?.id ?? idx, [items]),
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  useEffect(() => {
    setFocusedIndex((idx) => (count === 0 ? 0 : Math.min(idx, count - 1)));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (items.some((i) => i.id === id)) next.add(id);
      }
      return next;
    });
  }, [items, count]);

  const scrollToLogicalIndex = useCallback(
    (idx: number) => {
      virtualizer.scrollToIndex(idx, { align: "auto", behavior: "smooth" });
    },
    [virtualizer]
  );

  useEffect(() => {
    scrollToLogicalIndex(focusedIndex);
  }, [focusedIndex, scrollToLogicalIndex]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = useMemo(() => {
    if (count === 0) return false;
    return items.every((i) => selectedIds.has(i.id));
  }, [items, selectedIds, count]);

  const someSelected = useMemo(
    () => selectedIds.size > 0 && !allSelected,
    [selectedIds, allSelected]
  );

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }, [allSelected, items]);

  useApprovalHotkeys({
    totalItems: count,
    focusedIndex,
    setFocusedIndex,
    onToggleFocused: () => {
      const item = items[focusedIndex];
      if (item) toggleSelected(item.id);
    },
    onApproveFocused: () => {
      const item = items[focusedIndex];
      if (item) onApprove?.(item.id);
    },
    onRejectFocused: () => {
      const item = items[focusedIndex];
      if (item) onReject?.(item.id);
    },
    onBulkApproveSelected: () => {
      if (selectedIds.size > 0) onBulkApprove?.(Array.from(selectedIds));
    },
    onBulkRejectSelected: () => {
      if (selectedIds.size > 0) onBulkReject?.(Array.from(selectedIds));
    },
    enabled: !loading,
  });

  const selectedIdsArray = useMemo(
    () => Array.from(selectedIds),
    [selectedIds]
  );

  return (
    <div
      data-testid="virtual-approvals-list"
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid #e5e7eb",
        borderRadius: "0.5rem",
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        role="toolbar"
        aria-label="Approvals toolbar"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.625rem 1rem",
          borderBottom: "1px solid #e5e7eb",
          background: "#f9fafb",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
            fontSize: "0.8125rem",
            color: "#374151",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            aria-label="Select all approvals"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleSelectAll}
            disabled={count === 0 || loading}
          />
          {selectedIds.size === 0
            ? "Select all"
            : `${selectedIds.size} selected`}
        </label>

        <div style={{ flex: 1 }} />

        <span
          style={{ fontSize: "0.75rem", color: "#6b7280" }}
          aria-live="polite"
        >
          {count} item{count === 1 ? "" : "s"}
          {loading ? " — loading…" : ""}
        </span>

        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={selectedIds.size === 0 || loading}
          onClick={() => onBulkApprove?.(selectedIdsArray)}
        >
          Approve
          {selectedIds.size > 0 && ` (${selectedIds.size})`}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={selectedIds.size === 0 || loading}
          onClick={() => onBulkReject?.(selectedIdsArray)}
        >
          Reject
        </Button>
      </div>

      <div
        ref={parentRef}
        role="listbox"
        aria-label="Approvals list"
        aria-multiselectable="true"
        tabIndex={0}
        style={{
          height: Math.min(containerHeight, Math.max(rowHeight * 4, 80)),
          overflow: "auto",
          contain: "strict",
          background: "#fff",
        }}
      >
        {count === 0 ? (
          <div
            style={{
              padding: "2rem 1rem",
              textAlign: "center",
              color: "#6b7280",
              fontSize: "0.875rem",
            }}
            role="status"
          >
            {loading ? "Loading approvals…" : "No approvals match your filters"}
          </div>
        ) : (
          <div
            style={{
              height: `${totalHeight}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((vRow) => {
              const item = items[vRow.index];
              if (!item) return null;
              const isSelected = selectedIds.has(item.id);
              const isFocused = focusedIndex === vRow.index;
              return (
                <div
                  key={vRow.key}
                  role="option"
                  aria-selected={isSelected}
                  data-index={vRow.index}
                  data-item-id={item.id}
                  onClick={() => {
                    setFocusedIndex(vRow.index);
                    onRowClick?.(item);
                  }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${vRow.size}px`,
                    transform: `translateY(${vRow.start}px)`,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0 1rem",
                    borderBottom: "1px solid #f3f4f6",
                    background: isSelected
                      ? "#eff6ff"
                      : isFocused
                      ? "#f9fafb"
                      : "#fff",
                    boxShadow: isFocused ? "inset 2px 0 0 #2563eb" : undefined,
                    cursor: "pointer",
                    boxSizing: "border-box",
                  }}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.title}`}
                    checked={isSelected}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelected(item.id)}
                  />

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.125rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          color: "#111827",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.title}
                      </span>
                      <Chip variant={statusToChipVariant(item.status)}>
                        {item.status}
                      </Chip>
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#6b7280",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <span>{KIND_LABELS[item.kind] ?? item.kind}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {item.requesterDisplayName ??
                          `Requester ${item.requesterId.slice(0, 8)}`}
                      </span>
                      {item.amountStroops !== null && (
                        <>
                          <span aria-hidden>·</span>
                          <span
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {stroopsToDisplay(item.amountStroops, 4)} XLM
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "0.375rem",
                      flexShrink: 0,
                    }}
                  >
                    {item.status === "PENDING" && (
                      <>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onApprove?.(item.id);
                          }}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onReject?.(item.id);
                          }}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export { ROW_HEIGHT as APPROVALS_ROW_HEIGHT, OVERSCAN as APPROVALS_OVERSCAN };
