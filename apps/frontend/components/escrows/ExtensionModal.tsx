"use client";

import { useState } from "react";
import { Button } from "@delegolabs/ui";
import type { Escrow } from "@delegolabs/types";
import {
  availablePresets,
  computeExtendedDeadline,
  type ExtensionPreset,
} from "../../lib/extensions";
import { requestExtension } from "../../services/payments";
import { useEscrowTimeline } from "../../hooks/useEscrowTimeline";
import { escrowKey } from "../../lib/escrows";

export interface ExtensionModalProps {
  escrow: Escrow;
  onClose: () => void;
  /** Called with the updated escrow once the extension is confirmed on-chain. */
  onExtended?: (escrow: Escrow) => void;
}

/**
 * "Request extension" modal (#577): preset durations bounded by the
 * contract's remaining extension count and total time budget
 * (`lib/extensions.ts`). Submitting posts an optimistic timeline entry
 * immediately ("Extension requested (+1w)") and confirms or rolls it back
 * cleanly once the request settles.
 */
export function ExtensionModal({ escrow, onClose, onExtended }: ExtensionModalProps) {
  const [submitting, setSubmitting] = useState<ExtensionPreset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeline = useEscrowTimeline(escrowKey(escrow));
  const presets = availablePresets(escrow);

  async function handleRequest(preset: ExtensionPreset) {
    setSubmitting(preset);
    setError(null);

    const entryId = timeline.append({
      type: "extension_requested",
      title: `Extension requested (${preset})`,
      description: "Pending on-chain confirmation.",
      timestamp: new Date().toISOString(),
      status: "pending",
    });

    try {
      const res = await requestExtension(escrowKey(escrow), preset);
      if (res.error || !res.data) {
        throw new Error(res.error?.message ?? "Failed to request extension.");
      }
      timeline.update(entryId, {
        status: "confirmed",
        title: `Extension confirmed (${preset})`,
        description: undefined,
      });
      onExtended?.(res.data.escrow);
      onClose();
    } catch (err) {
      // Roll back the optimistic entry cleanly — the request never landed.
      timeline.remove(entryId);
      setError(err instanceof Error ? err.message : "Failed to request extension.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="approval-drawer-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Request extension for escrow ${escrowKey(escrow)}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface, #fff)",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          maxWidth: "28rem",
          margin: "10vh auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h2>Request extension</h2>
        <p>Extend the escrow deadline by a preset duration.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {presets.map(({ preset, label, eligible, reason }) => (
            <div key={preset} style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleRequest(preset)}
                disabled={!eligible || submitting !== null}
                loading={submitting === preset}
                title={reason}
              >
                {label} — new deadline {computeExtendedDeadline(escrow, preset).toLocaleDateString()}
              </Button>
              {!eligible && reason && (
                <span style={{ fontSize: "0.75rem", color: "#991b1b" }}>{reason}</span>
              )}
            </div>
          ))}
        </div>

        {error && (
          <p role="alert" style={{ fontSize: "0.8125rem", color: "#991b1b" }}>
            {error}
          </p>
        )}

        <div className="form-actions">
          <Button variant="ghost" onClick={onClose} disabled={submitting !== null}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
