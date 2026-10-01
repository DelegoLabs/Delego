"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  autoReleaseSummary,
  formatDeliveredTimestamp,
  isVerifiedAutoRelease,
  oracleProviderLabel,
  shortenProofHash,
  type AutoReleaseMeta,
} from "../../lib/autoRelease";

export interface AutoReleaseBadgeProps {
  meta: AutoReleaseMeta;
  /** Optional escrow/order context shown in the proof dialog header. */
  orderId?: string;
}

/** Shield-with-tick — "this delivery was verified", not a generic info dot. */
function VerifiedIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11.5 14.5 15.5 10" />
    </svg>
  );
}

/**
 * Escrow-card badge for a release that happened automatically from verified
 * carrier tracking (#708).
 *
 * Renders nothing for a manual release, which is what makes the two states
 * visually distinguishable. Opening it shows the oracle's signature and the
 * delivery evidence behind the payout.
 */
export function AutoReleaseBadge({ meta, orderId }: AutoReleaseBadgeProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap({ containerRef: dialogRef, isActive: open });

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // A manual (or unverifiable) release shows no badge at all — the absence of
  // the badge *is* the "released by the buyer" signal.
  if (!isVerifiedAutoRelease(meta)) return null;

  const summary = autoReleaseSummary(meta);
  const deliveredAt = formatDeliveredTimestamp(meta.deliveredTimestamp);
  const provider = oracleProviderLabel(meta.oracleProvider);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${summary}. View delivery proof.`}
        data-testid="auto-release-badge"
        style={{
          display: "inline-flex",
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
        }}
      >
        <Badge tone="success" style={{ gap: "0.25rem" }}>
          <VerifiedIcon />
          Auto-released
        </Badge>
      </button>

      {open && (
        <div
          className="approval-drawer-overlay"
          onClick={() => setOpen(false)}
          data-testid="auto-release-proof-backdrop"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auto-release-proof-title"
            data-testid="auto-release-proof-modal"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "calc(100% - 2rem)",
              maxWidth: "30rem",
              margin: "10vh auto",
              padding: "1.25rem",
              background: "var(--color-bg-surface, #fff)",
              borderRadius: "0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.875rem",
            }}
          >
            <h2 id="auto-release-proof-title" style={{ margin: 0 }}>
              Delivery proof
            </h2>

            <p style={{ margin: 0, color: "var(--color-text-muted, #6b7280)" }}>
              {summary}
              {orderId ? ` for order ${orderId}` : ""}. The escrow was released
              automatically once the carrier oracle confirmed delivery — no
              manual approval was required.
            </p>

            <dl className="wallet-detail-list" style={{ margin: 0 }}>
              <div className="wallet-detail-row">
                <dt>Carrier oracle</dt>
                <dd>{provider}</dd>
              </div>
              <div className="wallet-detail-row">
                <dt>Delivered</dt>
                <dd>{deliveredAt || "Unknown"}</dd>
              </div>
              <div className="wallet-detail-row">
                <dt>Signature</dt>
                <dd
                  title={meta.signatureProofHash}
                  style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.75rem" }}
                >
                  <code>{shortenProofHash(meta.signatureProofHash)}</code>
                </dd>
              </div>
            </dl>

            <div className="form-actions">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
