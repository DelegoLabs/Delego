"use client";

import { useMemo, useState } from "react";
import type { Escrow } from "@delegolabs/types";
import { useEscrows } from "../../hooks/useEscrows";
import { escrowKey } from "../../lib/escrows";
import { EscrowCard } from "./EscrowCard";
import { StickyActionBar } from "./StickyActionBar";

export interface EscrowListProps {
  /** Releases a single escrow — wired by the caller to the real release API. Omit to disable the batch release action. */
  onReleaseOne?: (escrow: Escrow) => Promise<unknown>;
}

/**
 * Escrow list with checkbox multi-select (#582): each row can be selected,
 * and any selection surfaces the sticky bottom `<StickyActionBar>` with the
 * batch actions (release-eligible count, request extension, export).
 */
export function EscrowList({ onReleaseOne }: EscrowListProps) {
  const { escrows, loading, error } = useEscrows();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = escrows.length > 0 && selectedIds.size === escrows.length;

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(escrows.map(escrowKey)));
  };

  const selected = useMemo(
    () => escrows.filter((e) => selectedIds.has(escrowKey(e))),
    [escrows, selectedIds]
  );

  if (loading) {
    return (
      <div className="card skeleton">
        <div className="skeleton-title" />
        <div className="skeleton-text" />
        <div className="skeleton-text" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="settings-status error" role="alert">
        {error}
      </div>
    );
  }

  if (escrows.length === 0) {
    return (
      <div className="card">
        <p>No escrows yet.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          type="checkbox"
          aria-label="Select all escrows"
          checked={allSelected}
          onChange={toggleAll}
        />
        <span>Select all</span>
      </div>

      <div className="grid">
        {escrows.map((escrow) => {
          const key = escrowKey(escrow);
          return (
            <div key={key} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
              <input
                type="checkbox"
                aria-label={`Select escrow ${key}`}
                checked={selectedIds.has(key)}
                onChange={() => toggle(key)}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <EscrowCard escrow={escrow} />
              </div>
            </div>
          );
        })}
      </div>

      <StickyActionBar
        selected={selected}
        onClearSelection={() => setSelectedIds(new Set())}
        onReleaseOne={onReleaseOne}
      />
    </div>
  );
}
