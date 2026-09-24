"use client";

import { useEffect, useRef } from "react";
import { Button, formatAmount } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { SimulationDryRunResult } from "../../lib/simulationDryRun";

export interface SimulationDryRunModalProps {
  isOpen: boolean;
  result: SimulationDryRunResult | null;
  loading?: boolean;
  confirming?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

function formatFee(stroops: string): string {
  if (!/^\d+$/.test(stroops)) return `${stroops} stroops`;
  try {
    const formatted = formatAmount(BigInt(stroops));
    return `${formatted.value} ${formatted.symbol} (${BigInt(stroops).toLocaleString()} stroops)`;
  } catch {
    return `${stroops} stroops`;
  }
}

/**
 * Shows Soroban resource usage before a contract call is confirmed (#703).
 * Confirm stays disabled when the simulation reverts.
 */
export function SimulationDryRunModal({
  isOpen,
  result,
  loading = false,
  confirming = false,
  onClose,
  onConfirm,
}: SimulationDryRunModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, isOpen);
  const confirmBlocked = loading || !result?.success || confirming;

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="approval-drawer-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Soroban transaction simulation"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface, #fff)",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          maxWidth: "30rem",
          margin: "8vh auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h2 style={{ margin: 0 }}>Simulation dry-run</h2>

        {loading && (
          <p role="status" style={{ margin: 0 }}>
            Simulating contract call…
          </p>
        )}

        {result && !result.success && (
          <div
            role="alert"
            style={{
              background: "#fef2f2",
              color: "#991b1b",
              border: "1px solid #fecaca",
              borderRadius: "0.5rem",
              padding: "0.75rem",
            }}
          >
            {result.errorReason?.trim() ||
              "Simulation reverted. This call cannot be confirmed."}
          </div>
        )}

        {result && (
          <dl className="wallet-detail-list">
            <div className="wallet-detail-row">
              <dt>CPU instructions</dt>
              <dd>{result.cpuInstructions.toLocaleString()}</dd>
            </div>
            <div className="wallet-detail-row">
              <dt>Memory</dt>
              <dd>{result.memoryBytes.toLocaleString()} bytes</dd>
            </div>
            <div className="wallet-detail-row">
              <dt>Estimated fee</dt>
              <dd>{formatFee(result.estimatedFeeStroops)}</dd>
            </div>
            <div className="wallet-detail-row">
              <dt>Return value</dt>
              <dd>
                <code>{result.simulatedReturnValue || "None"}</code>
              </dd>
            </div>
          </dl>
        )}

        <div className="form-actions">
          <Button variant="ghost" type="button" onClick={onClose} disabled={confirming}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => void onConfirm()}
            disabled={confirmBlocked}
            loading={confirming}
          >
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}
