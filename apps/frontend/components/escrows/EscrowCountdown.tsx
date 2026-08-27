"use client";

import { useState } from "react";
import { Button } from "@delegolabs/ui";
import type { Escrow } from "@delegolabs/types";
import { useNow } from "../../hooks/useNow";
import { ExtensionModal } from "./ExtensionModal";

export interface EscrowCountdownProps {
  escrow: Escrow;
  /** Show "Request extension" once remaining time drops below this many ms. Default 24h. */
  nearExpiryThresholdMs?: number;
  onExtended?: (escrow: Escrow) => void;
}

/** "2d 4h" / "3h 12m" / "45m" / "Expired" */
function formatRemaining(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Deadline countdown + contract timeout metadata for an escrow (#577):
 * original deadline, extensions already consumed, and — once the deadline
 * is near — a "Request extension" action that opens `<ExtensionModal>`.
 */
export function EscrowCountdown({
  escrow,
  nearExpiryThresholdMs = 24 * 3600 * 1000,
  onExtended,
}: EscrowCountdownProps) {
  const now = useNow(30_000);
  const [modalOpen, setModalOpen] = useState(false);

  const deadline = escrow.deadline ?? escrow.originalDeadline;
  if (!deadline) return null; // no time-based deadline metadata for this escrow

  const remainingMs = new Date(deadline).getTime() - now.getTime();
  const nearExpiry = remainingMs > 0 && remainingMs <= nearExpiryThresholdMs;
  const extensionsConsumed = escrow.extensionsConsumed ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <dl className="wallet-detail-list">
        <div className="wallet-detail-row">
          <dt>Deadline</dt>
          <dd data-testid="escrow-countdown-remaining">{formatRemaining(remainingMs)}</dd>
        </div>
        {escrow.originalDeadline && (
          <div className="wallet-detail-row">
            <dt>Original deadline</dt>
            <dd>{new Date(escrow.originalDeadline).toLocaleString()}</dd>
          </div>
        )}
        <div className="wallet-detail-row">
          <dt>Extensions used</dt>
          <dd>
            {extensionsConsumed}
            {escrow.maxExtensions !== undefined ? ` / ${escrow.maxExtensions}` : ""}
          </dd>
        </div>
      </dl>

      {nearExpiry && (
        <Button variant="secondary" size="sm" onClick={() => setModalOpen(true)}>
          Request extension
        </Button>
      )}

      {modalOpen && (
        <ExtensionModal
          escrow={escrow}
          onClose={() => setModalOpen(false)}
          onExtended={(updated) => {
            setModalOpen(false);
            onExtended?.(updated);
          }}
        />
      )}
    </div>
  );
}
