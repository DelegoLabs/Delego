"use client";

import type { Delegation } from "@delegolabs/types";
import {
  deriveDelegateChip,
  formatStaleness,
  type DelegateChipStatus,
} from "../../lib/delegateStatus";

export interface DelegationStatusChipProps {
  delegation: Delegation;
  /** Total spent this period, if known — enables the `threshold-reached` state. */
  spent?: bigint | number;
  /** Period spend cap, if known — enables the `threshold-reached` state. */
  cap?: bigint | number;
  /** epoch ms of the last successful status read; when set, shows a subtle "as of X min ago". */
  staleAsOf?: number | null;
  /** Invoked when the user clicks Resume on a paused delegation. */
  onResume?: () => void;
  /** Invoked when the user clicks Renew on an expired delegation. */
  onRenew?: () => void;
}

const CHIP_TONE: Record<DelegateChipStatus, { bg: string; fg: string }> = {
  active: { bg: "var(--color-success-subtle, #d1fae5)", fg: "#065f46" },
  paused: { bg: "var(--color-warning-subtle, #fef3c7)", fg: "#92400e" },
  expired: { bg: "var(--color-bg-subtle, #e5e7eb)", fg: "#374151" },
  "threshold-reached": {
    bg: "var(--color-danger-subtle, #fee2e2)",
    fg: "#991b1b",
  },
  revoked: { bg: "var(--color-danger-subtle, #fee2e2)", fg: "#991b1b" },
  pending: { bg: "var(--color-bg-subtle, #e5e7eb)", fg: "#374151" },
};

/**
 * Agent health chip for a delegation (#594): renders Active / Paused / Expired
 * / Threshold-reached with tooltip detail, drives the resume/renew affordances
 * (reusing existing controls), and tolerates stale reads with an "as of X" note.
 * Reusable across the list card, detail header, and approvals context headers.
 */
export function DelegationStatusChip({
  delegation,
  spent,
  cap,
  staleAsOf,
  onResume,
  onRenew,
}: DelegationStatusChipProps) {
  const chip = deriveDelegateChip(delegation, { spent, cap });
  const tone = CHIP_TONE[chip.status];

  return (
    <span className="delegation-status-chip-wrap flex items-center gap-2">
      <span
        className={`status-chip status-chip--${chip.status} status-${delegation.status}`}
        data-testid="delegation-status-chip"
        title={chip.tooltip}
        aria-label={`${chip.label}. ${chip.tooltip}`}
        style={{
          padding: "0.125rem 0.5rem",
          borderRadius: "9999px",
          fontSize: "0.75rem",
          fontWeight: 600,
          backgroundColor: tone.bg,
          color: tone.fg,
        }}
      >
        {chip.label}
      </span>

      {typeof staleAsOf === "number" && (
        <span
          className="status-chip-stale"
          data-testid="delegation-status-stale"
          style={{
            fontSize: "0.6875rem",
            color: "var(--color-text-subtle, #9ca3af)",
          }}
        >
          {formatStaleness(staleAsOf)}
        </span>
      )}

      {chip.canResume && onResume && (
        <button
          type="button"
          className="status-chip-action text-xs text-slate-600 hover:text-slate-800 dark:hover:text-slate-200"
          onClick={onResume}
          data-testid="delegation-status-resume"
        >
          Resume
        </button>
      )}

      {chip.canRenew && onRenew && (
        <button
          type="button"
          className="status-chip-action text-xs text-slate-600 hover:text-slate-800 dark:hover:text-slate-200"
          onClick={onRenew}
          data-testid="delegation-status-renew"
        >
          Renew
        </button>
      )}
    </span>
  );
}
