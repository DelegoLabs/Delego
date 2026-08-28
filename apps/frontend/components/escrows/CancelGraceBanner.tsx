"use client";

import { useLocale } from "next-intl";
import { Button } from "@delegolabs/ui";
import type { CancellationGrace } from "@delegolabs/types";
import { useCancelGrace } from "../../hooks/useCancelGrace";
import { formatDateTime } from "../../lib/intl";

export interface CancelGraceBannerProps {
  escrowId: string;
  /** The cancellation grace embedded in the escrow payload, or null/undefined if not cancelling. */
  serverGrace?: CancellationGrace | null;
  onFinalized?: (escrowId: string) => void;
  onRestored?: (escrowId: string) => void;
}

/** "3:07" — minutes:seconds remaining, for the compact countdown chip. */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Persistent banner shown while an escrow cancellation is within its undo
 * grace period (#580). Backed by `useCancelGrace`, which reads the
 * server-issued expiry (immune to client clock skew), persists across
 * reloads, and finalizes automatically once the window lapses.
 */
export function CancelGraceBanner({
  escrowId,
  serverGrace,
  onFinalized,
  onRestored,
}: CancelGraceBannerProps) {
  const locale = useLocale();
  const { grace, remainingMs, undo, undoing, finalizing, error } = useCancelGrace({
    escrowId,
    serverGrace,
    onFinalized,
    onRestored,
  });

  if (!grace) return null;

  const undoDeadlineLabel = formatDateTime(new Date(grace.graceExpiresAt), locale, {
    timeStyle: "short",
  });

  return (
    <div
      role="status"
      data-testid="cancel-grace-banner"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        flexWrap: "wrap",
        padding: "0.625rem 0.875rem",
        borderRadius: "0.5rem",
        background: "var(--color-warning-bg, #fffbeb)",
        border: "1px solid var(--color-warning-border, #fde68a)",
        color: "var(--color-warning-text, #92400e)",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <strong>Cancelling…</strong>
        <span>
          Undo until {undoDeadlineLabel} ({formatCountdown(remainingMs)})
        </span>
      </span>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => void undo()}
        disabled={undoing || finalizing}
        loading={undoing}
      >
        Undo
      </Button>

      {error && (
        <span role="alert" style={{ width: "100%", fontSize: "0.8125rem", color: "#991b1b" }}>
          {error}
        </span>
      )}
    </div>
  );
}
