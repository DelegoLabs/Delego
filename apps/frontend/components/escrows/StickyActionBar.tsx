"use client";

import { useState } from "react";
import { Button } from "@delegolabs/ui";
import type { Escrow } from "@delegolabs/types";
import { runBatch, summarizeBatch, type BatchItemResult } from "../../lib/batchRunner";
import { isReleaseEligible, isExtensionEligible, countReleaseEligible } from "../../lib/escrowEligibility";
import { requestExtension } from "../../services/payments";
import { toCsv, downloadCsv } from "../../lib/csv";
import { EXTENSION_PRESETS, presetLabel, type ExtensionPreset } from "../../lib/extensions";
import { escrowKey } from "../../lib/escrows";

export interface StickyActionBarProps {
  selected: Escrow[];
  onClearSelection: () => void;
  /** Releases a single escrow — wired by the caller to the real release API. Omit to disable the release action. */
  onReleaseOne?: (escrow: Escrow) => Promise<unknown>;
  concurrency?: number;
}

type BatchKind = "release" | "extend";

/**
 * Sticky bottom bar for the escrow multi-select batch actions (#582):
 * release-eligible count, a "Request extension" batch action, and CSV
 * export — all backed by the shared `runBatch` utility so ineligible
 * selections are skipped (with an inline reason) instead of halting the
 * whole batch, and per-item results are reported once it completes.
 */
export function StickyActionBar({
  selected,
  onClearSelection,
  onReleaseOne,
  concurrency = 3,
}: StickyActionBarProps) {
  const [running, setRunning] = useState<BatchKind | null>(null);
  const [results, setResults] = useState<BatchItemResult<Escrow, unknown>[] | null>(null);
  const [preset, setPreset] = useState<ExtensionPreset>("+1d");

  if (selected.length === 0) return null;

  const eligibleReleaseCount = countReleaseEligible(selected);

  async function handleRelease() {
    if (!onReleaseOne) return;
    setRunning("release");
    setResults(null);
    const res = await runBatch(selected, (escrow) => onReleaseOne(escrow), {
      concurrency,
      isEligible: isReleaseEligible,
    });
    setResults(res);
    setRunning(null);
  }

  async function handleRequestExtension() {
    setRunning("extend");
    setResults(null);
    const res = await runBatch(
      selected,
      async (escrow) => {
        const response = await requestExtension(escrowKey(escrow), preset);
        if (response.error) throw new Error(response.error.message);
        return response.data;
      },
      { concurrency, isEligible: (escrow) => isExtensionEligible(escrow, preset) }
    );
    setResults(res);
    setRunning(null);
  }

  function handleExport() {
    const header = ["Escrow ID", "Order ID", "Status", "Amount"];
    const rows = selected.map((e) => [escrowKey(e), e.orderId, String(e.status), String(e.amount)]);
    downloadCsv(`escrows-export-${Date.now()}.csv`, toCsv(header, rows));
  }

  const summary = results ? summarizeBatch(results) : null;

  return (
    <div
      role="toolbar"
      aria-label="Escrow batch actions"
      data-testid="sticky-action-bar"
      style={{
        position: "sticky",
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        padding: "0.75rem 1rem",
        background: "var(--color-surface, #fff)",
        borderTop: "1px solid var(--color-border, #e5e7eb)",
        boxShadow: "0 -2px 8px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <span>
          <strong>{selected.length}</strong> selected · <strong>{eligibleReleaseCount}</strong> release-eligible
        </span>

        <Button
          variant="primary"
          size="sm"
          onClick={handleRelease}
          disabled={!onReleaseOne || running !== null || eligibleReleaseCount === 0}
          loading={running === "release"}
        >
          Release eligible ({eligibleReleaseCount})
        </Button>

        <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.8125rem" }}>
          Duration
          <select
            aria-label="Extension duration"
            value={preset}
            onChange={(e) => setPreset(e.target.value as ExtensionPreset)}
            disabled={running !== null}
          >
            {EXTENSION_PRESETS.map((p) => (
              <option key={p} value={p}>
                {presetLabel(p)}
              </option>
            ))}
          </select>
        </label>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleRequestExtension}
          disabled={running !== null}
          loading={running === "extend"}
        >
          Request extension
        </Button>

        <Button variant="ghost" size="sm" onClick={handleExport}>
          Export
        </Button>

        <Button variant="ghost" size="sm" onClick={onClearSelection} disabled={running !== null}>
          Clear
        </Button>
      </div>

      {summary && (
        <div role="status" data-testid="batch-results-summary" style={{ fontSize: "0.8125rem" }}>
          <span>
            {summary.success} succeeded, {summary.error} failed, {summary.skipped} skipped
          </span>
          {results && results.some((r) => r.status !== "success") && (
            <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
              {results
                .filter((r) => r.status !== "success")
                .map((r, i) => (
                  <li key={`${escrowKey(r.item)}-${i}`}>
                    {escrowKey(r.item)}: {r.error}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
