"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { Delegation, UpdateDelegationInput } from "@delegolabs/types";
import { DelegationCard } from "./DelegationCard";

export interface DelegationListProps {
  delegations: Delegation[];
  loading: boolean;
  pendingIds: Set<string>;
  onUpdate: (
    id: string,
    input: UpdateDelegationInput
  ) => void | Promise<unknown>;
  onRevoke: (id: string) => void | Promise<unknown>;
  onDuplicate?: (delegation: Delegation) => void;
  /** True when `delegations` has been narrowed by an active filter, for a more specific empty state. */
  filtered?: boolean;
}

function DelegationSkeletonCard() {
  return (
    <div className="card skeleton">
      <div className="skeleton-title" />
      <div className="skeleton-text" />
      <div className="skeleton-text" />
      <div className="skeleton-button" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk-action confirmation modal (focus-managed)
// ---------------------------------------------------------------------------

type BulkAction = "pause" | "resume" | "revoke";

function BulkConfirmModal({
  action,
  count,
  failedCount,
  onConfirm,
  onCancel,
  busy,
}: {
  action: BulkAction;
  count: number;
  failedCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const labels: Record<BulkAction, { verb: string; color: string }> = {
    pause:  { verb: "Pause",  color: "#d29922" },
    resume: { verb: "Resume", color: "#3fb950" },
    revoke: { verb: "Revoke", color: "#f85149" },
  };
  const { verb, color } = labels[action];

  // Focus management: move focus into the modal on open, restore on close
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    // Save the element that triggered the modal
    triggerRef.current = document.activeElement;
    // Move focus to the confirm button
    confirmBtnRef.current?.focus();

    // Keyboard trap
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { onCancel(); return; }
      if (e.key !== "Tab") return;
      const modal = confirmBtnRef.current?.closest("[role='dialog']") as HTMLElement | null;
      if (!modal) return;
      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])"
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus to the trigger when modal closes
      if (triggerRef.current && typeof (triggerRef.current as HTMLElement).focus === "function") {
        (triggerRef.current as HTMLElement).focus();
      }
    };
  }, [busy, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-modal-title"
      aria-describedby="bulk-modal-desc"
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div
        style={{
          background: "var(--surface, #161b22)",
          border: "1px solid var(--border, #30363d)",
          borderRadius: 12, padding: "24px 28px", maxWidth: 440, width: "90%",
        }}
      >
        <h2
          id="bulk-modal-title"
          style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--foreground, #e6edf3)" }}
        >
          {verb} {count} delegation{count !== 1 ? "s" : ""}?
        </h2>
        <p
          id="bulk-modal-desc"
          style={{ margin: "8px 0 20px", fontSize: 14, color: "var(--muted, #8b949e)" }}
        >
          {action === "revoke"
            ? "Revoked delegations cannot be re-activated. This action is permanent."
            : `This will ${verb.toLowerCase()} the selected delegations.`}
        </p>

        {failedCount != null && failedCount > 0 && (
          <p role="alert" style={{ margin: "0 0 16px", fontSize: 13, color: "#f85149" }}>
            {failedCount} operation{failedCount !== 1 ? "s" : ""} failed. Failed items remain selected — retry or deselect them.
          </p>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={ghostBtnStyle}
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: color, color: "#fff", fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer", fontSize: 14, opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? `${verb}ing…` : `${verb} ${count}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const ghostBtnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 8,
  border: "1px solid var(--border, #30363d)",
  background: "transparent", color: "var(--muted, #8b949e)",
  cursor: "pointer", fontSize: 14,
};

// ---------------------------------------------------------------------------
// Bulk action toolbar
// ---------------------------------------------------------------------------

function BulkToolbar({
  selected,
  total,
  onSelectAll,
  onClearAll,
  onBulkAction,
  busy,
}: {
  selected: number;
  total: number;
  onSelectAll: () => void;
  onClearAll: () => void;
  onBulkAction: (action: BulkAction) => void;
  busy: boolean;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Bulk delegation actions"
      style={{
        position: "sticky", top: 0, zIndex: 10,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "10px 16px",
        background: "var(--surface, #161b22)",
        border: "1px solid var(--border, #30363d)",
        borderRadius: 10, marginBottom: 16,
      }}
    >
      <span style={{ fontSize: 14, color: "var(--muted, #8b949e)", marginRight: 4 }}>
        {selected} of {total} selected
      </span>

      {selected < total ? (
        <button type="button" onClick={onSelectAll} disabled={busy}
          style={actionBtnStyle("var(--accent, #58a6ff)")}
          aria-label="Select all visible delegations"
        >
          Select all
        </button>
      ) : (
        <button type="button" onClick={onClearAll} disabled={busy}
          style={actionBtnStyle("var(--muted, #8b949e)")}
          aria-label="Clear selection"
        >
          Clear all
        </button>
      )}

      <div style={{ flex: 1 }} />

      <button type="button" onClick={() => onBulkAction("pause")}
        style={actionBtnStyle("#d29922")} disabled={busy || selected === 0}
        aria-label={`Pause ${selected} selected delegations`}
      >
        Pause
      </button>
      <button type="button" onClick={() => onBulkAction("resume")}
        style={actionBtnStyle("#3fb950")} disabled={busy || selected === 0}
        aria-label={`Resume ${selected} selected delegations`}
      >
        Resume
      </button>
      <button type="button" onClick={() => onBulkAction("revoke")}
        style={actionBtnStyle("#f85149")} disabled={busy || selected === 0}
        aria-label={`Revoke ${selected} selected delegations`}
      >
        Revoke
      </button>
    </div>
  );
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    padding: "6px 14px", borderRadius: 8,
    border: `1px solid ${color}`,
    background: "transparent", color: color,
    cursor: "pointer", fontSize: 13, fontWeight: 500,
  };
}

// ---------------------------------------------------------------------------
// DelegationList with multi-select
// ---------------------------------------------------------------------------

/** Grid of delegation cards with multi-select checkboxes and a sticky bulk-action bar. */
export function DelegationList({
  delegations,
  loading,
  pendingIds,
  onUpdate,
  onRevoke,
  onDuplicate,
  filtered = false,
}: DelegationListProps) {
  // selectedIds is always pruned to the currently visible delegations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  // Prune selection when visible delegations change (e.g. filter applied)
  const visibleIds = new Set(delegations.map((d) => d.id));
  const effectiveSelected = new Set([...selectedIds].filter((id) => visibleIds.has(id)));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(delegations.map((d) => d.id)));
  }, [delegations]);

  const handleClearAll = useCallback(() => setSelectedIds(new Set()), []);

  const handleBulkAction = useCallback((action: BulkAction) => {
    setFailedIds(new Set());
    setPendingAction(action);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!pendingAction) return;
    setBulkBusy(true);
    try {
      // Operate only on IDs still visible in the current delegation list
      const currentVisibleIds = new Set(delegations.map((d) => d.id));
      const ids = Array.from(effectiveSelected).filter((id) => currentVisibleIds.has(id));

      // Use Promise.allSettled so a partial failure does not abort remaining ops
      const results = await Promise.allSettled(
        ids.map((id) => {
          if (pendingAction === "revoke") return Promise.resolve(onRevoke(id));
          return Promise.resolve(
            onUpdate(id, { status: pendingAction === "pause" ? "paused" : "active" } as UpdateDelegationInput)
          );
        })
      );

      const newFailed = new Set<string>();
      results.forEach((result, i) => {
        if (result.status === "rejected") newFailed.add(ids[i]);
      });

      if (newFailed.size > 0) {
        // Keep only failed IDs selected; show error state in modal
        setSelectedIds(newFailed);
        setFailedIds(newFailed);
      } else {
        // All succeeded — clear selection and close modal
        setSelectedIds(new Set());
        setFailedIds(new Set());
        setPendingAction(null);
      }
    } finally {
      setBulkBusy(false);
    }
  }, [pendingAction, effectiveSelected, delegations, onRevoke, onUpdate]);

  const handleCancel = useCallback(() => {
    if (!bulkBusy) {
      setPendingAction(null);
      setFailedIds(new Set());
    }
  }, [bulkBusy]);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading && delegations.length === 0) {
    return (
      <div className="grid">
        <DelegationSkeletonCard />
        <DelegationSkeletonCard />
        <DelegationSkeletonCard />
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (delegations.length === 0) {
    return (
      <div className="card">
        <p>
          {filtered
            ? "No delegations match the current filters."
            : "No delegations yet. Grant one to let an AI agent shop on your behalf."}
        </p>
      </div>
    );
  }

  return (
    <>
      <BulkToolbar
        selected={effectiveSelected.size}
        total={delegations.length}
        onSelectAll={handleSelectAll}
        onClearAll={handleClearAll}
        onBulkAction={handleBulkAction}
        busy={bulkBusy}
      />

      <div className="grid">
        {delegations.map((delegation) => (
          <div key={delegation.id} style={{ position: "relative" }}>
            <label
              aria-label={`Select delegation ${delegation.label || delegation.id}`}
              style={{
                position: "absolute", top: 10, left: 10, zIndex: 2,
                display: "flex", alignItems: "center", cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={effectiveSelected.has(delegation.id)}
                onChange={() => toggleSelect(delegation.id)}
                aria-label={`Select delegation ${delegation.label || delegation.id}`}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--accent, #58a6ff)" }}
              />
            </label>

            <div
              style={{
                opacity: effectiveSelected.size > 0 && !effectiveSelected.has(delegation.id) ? 0.6 : 1,
                transition: "opacity 0.15s",
              }}
            >
              <DelegationCard
                delegation={delegation}
                pending={pendingIds.has(delegation.id)}
                onUpdate={onUpdate}
                onRevoke={onRevoke}
                onDuplicate={onDuplicate}
              />
            </div>
          </div>
        ))}
      </div>

      {pendingAction !== null && (
        <BulkConfirmModal
          action={pendingAction}
          count={effectiveSelected.size}
          failedCount={failedIds.size}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          busy={bulkBusy}
        />
      )}
    </>
  );
}
