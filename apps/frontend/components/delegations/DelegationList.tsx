"use client";

import { useState, useCallback, useId } from "react";
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
// Bulk-action confirmation modal
// ---------------------------------------------------------------------------

type BulkAction = "pause" | "resume" | "revoke";

function BulkConfirmModal({
  action,
  count,
  onConfirm,
  onCancel,
  busy,
}: {
  action: BulkAction;
  count: number;
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Confirm bulk ${verb}`}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: "var(--surface, #161b22)",
          border: "1px solid var(--border, #30363d)",
          borderRadius: 12, padding: "24px 28px", maxWidth: 440, width: "90%",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--foreground, #e6edf3)" }}>
          {verb} {count} delegation{count !== 1 ? "s" : ""}?
        </h2>
        <p style={{ margin: "8px 0 20px", fontSize: 14, color: "var(--muted, #8b949e)" }}>
          {action === "revoke"
            ? "Revoked delegations cannot be re-activated. This action is permanent."
            : `This will ${verb.toLowerCase()} the selected delegations.`}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #30363d)",
              background: "transparent", color: "var(--muted, #8b949e)",
              cursor: busy ? "not-allowed" : "pointer", fontSize: 14,
            }}
          >
            Cancel
          </button>
          <button
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
        <button type="button" onClick={onSelectAll}
          style={btnStyle("var(--accent, #58a6ff)")}
          disabled={busy}
        >
          Select all
        </button>
      ) : (
        <button type="button" onClick={onClearAll}
          style={btnStyle("var(--muted, #8b949e)")}
          disabled={busy}
        >
          Clear all
        </button>
      )}

      <div style={{ flex: 1 }} />

      <button type="button" onClick={() => onBulkAction("pause")}
        style={btnStyle("#d29922")} disabled={busy || selected === 0}
        aria-label={`Pause ${selected} selected delegations`}
      >
        Pause
      </button>
      <button type="button" onClick={() => onBulkAction("resume")}
        style={btnStyle("#3fb950")} disabled={busy || selected === 0}
        aria-label={`Resume ${selected} selected delegations`}
      >
        Resume
      </button>
      <button type="button" onClick={() => onBulkAction("revoke")}
        style={btnStyle("#f85149")} disabled={busy || selected === 0}
        aria-label={`Revoke ${selected} selected delegations`}
      >
        Revoke
      </button>
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

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
    setPendingAction(action);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!pendingAction) return;
    setBulkBusy(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(
        ids.map((id) => {
          if (pendingAction === "revoke") return onRevoke(id);
          return onUpdate(id, {
            status: pendingAction === "pause" ? "paused" : "active",
          } as UpdateDelegationInput);
        })
      );
      setSelectedIds(new Set());
    } finally {
      setBulkBusy(false);
      setPendingAction(null);
    }
  }, [pendingAction, selectedIds, onRevoke, onUpdate]);

  const handleCancel = useCallback(() => {
    if (!bulkBusy) setPendingAction(null);
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
      {/* Bulk toolbar — always visible so users can select without scrolling */}
      <BulkToolbar
        selected={selectedIds.size}
        total={delegations.length}
        onSelectAll={handleSelectAll}
        onClearAll={handleClearAll}
        onBulkAction={handleBulkAction}
        busy={bulkBusy}
      />

      {/* Delegation grid */}
      <div className="grid">
        {delegations.map((delegation) => (
          <div key={delegation.id} style={{ position: "relative" }}>
            {/* Checkbox overlay */}
            <label
              aria-label={`Select delegation ${delegation.label || delegation.id}`}
              style={{
                position: "absolute", top: 10, left: 10, zIndex: 2,
                display: "flex", alignItems: "center", cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(delegation.id)}
                onChange={() => toggleSelect(delegation.id)}
                aria-label={`Select delegation ${delegation.label || delegation.id}`}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--accent, #58a6ff)" }}
              />
            </label>

            {/* Card — slightly dimmed when unselected and others are selected */}
            <div
              style={{
                opacity: selectedIds.size > 0 && !selectedIds.has(delegation.id) ? 0.6 : 1,
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

      {/* Bulk-action confirmation modal */}
      {pendingAction !== null && (
        <BulkConfirmModal
          action={pendingAction}
          count={selectedIds.size}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          busy={bulkBusy}
        />
      )}
    </>
  );
}
