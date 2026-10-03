"use client";

import { useState } from "react";
import { Amount, Badge, Button, type BadgeTone } from "@delegolabs/ui";
import {
  canSignPendingApproval,
  formatExpiryLabel,
  pendingApprovalUrgency,
  sortPendingApprovals,
  type PendingApprovalItem,
  type PendingApprovalUrgency,
} from "../../lib/pendingApprovals";
import { useCurrency } from "../../hooks/useCurrency";

export interface PendingApprovalQueueProps {
  items: PendingApprovalItem[];
  /** Connected wallet address — the identity that would provide the signature. */
  signerAddress: string | null;
  /** Order IDs with an in-flight signature; their row's button is disabled. */
  signingIds?: ReadonlySet<string>;
  /** Approves + signs `orderId`. Throw to surface a row-level error. */
  onSign: (orderId: string) => Promise<unknown> | unknown;
  /** Clock used for expiry countdowns; defaults to the caller passing `useNow()`. */
  now?: Date;
  loading?: boolean;
  /** Shown above the list when the queue couldn't be loaded. */
  error?: string | null;
  onRetry?: () => void;
}

const URGENCY_TONES: Record<PendingApprovalUrgency, BadgeTone> = {
  expired: "neutral",
  critical: "error",
  warning: "warning",
  normal: "info",
};

/** `GABCD…WXYZ` for scan-friendly display of Stellar addresses. */
export function shortenAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 5)}…${address.slice(-4)}`;
}

/**
 * The multi-sig approval queue (#780): every transaction still waiting on a
 * secondary signature, most urgent first, each with a 1-click "Approve & sign"
 * action. Rows the connected signer can't act on (their own request, or an
 * expired window) stay visible but disabled, with the reason spelled out —
 * hiding them would hide work a colleague still has to do.
 */
export function PendingApprovalQueue({
  items,
  signerAddress,
  signingIds,
  onSign,
  now,
  loading,
  error,
  onRetry,
}: PendingApprovalQueueProps) {
  const { currencyId, rate } = useCurrency();
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [inFlightId, setInFlightId] = useState<string | null>(null);

  const busyIds = new Set<string>([
    ...(signingIds ?? []),
    ...(inFlightId ? [inFlightId] : []),
  ]);
  const ordered = sortPendingApprovals(items);

  async function handleSign(orderId: string) {
    setInFlightId(orderId);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    try {
      await onSign(orderId);
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [orderId]:
          err instanceof Error ? err.message : "Signing failed. Please try again.",
      }));
    } finally {
      setInFlightId(null);
    }
  }

  if (loading && items.length === 0) {
    return (
      <div className="card skeleton" data-testid="pending-approvals-loading">
        <div className="skeleton-title" />
        <div className="skeleton-text" />
        <div className="skeleton-button" />
      </div>
    );
  }

  return (
    <section className="pending-approvals" aria-label="Approvals awaiting your signature">
      {error && (
        <div className="settings-status error" role="alert">
          {error}
          {onRetry && (
            <>
              {" "}
              <button type="button" className="focus-visible-ring" onClick={onRetry}>
                Try again
              </button>
            </>
          )}
        </div>
      )}

      {ordered.length === 0 ? (
        <p className="pending-approvals-empty" data-testid="pending-approvals-empty">
          Nothing is waiting on a second signature. High-value team requests that still need
          your approval will appear here.
        </p>
      ) : (
        <ul className="pending-approvals-list">
          {ordered.map((item) => {
            const check = canSignPendingApproval(item, signerAddress, now);
            const urgency = pendingApprovalUrgency(item, now);
            const busy = busyIds.has(item.orderId);
            const reasonId = `pending-approval-reason-${item.orderId}`;
            const isRequester = signerAddress !== null && item.requestedBy === signerAddress;
            return (
              <li
                key={item.orderId}
                className={`pending-approvals-item pending-approvals-item-${urgency}`}
                data-testid={`pending-approval-${item.orderId}`}
              >
                <div className="pending-approvals-item-main">
                  <p className="pending-approvals-item-title">
                    <strong>{item.orderId}</strong>
                    <span className="stat-label">
                      {" "}
                      to {shortenAddress(item.recipient)}
                    </span>
                  </p>
                  <p className="stat-label" style={{ margin: 0 }}>
                    Requested by{" "}
                    {isRequester ? "you" : shortenAddress(item.requestedBy)}
                  </p>
                </div>

                <div className="pending-approvals-item-side">
                  <p className="pending-approvals-item-amount">
                    <Amount
                      stroops={item.amountStroops}
                      currency={currencyId}
                      xlmUsdRate={rate?.xlmUsdRate}
                    />
                  </p>
                  <Badge tone={URGENCY_TONES[urgency]}>
                    {formatExpiryLabel(item, now)}
                  </Badge>
                </div>

                <div className="pending-approvals-item-action">
                  <Button
                    variant="primary"
                    onClick={() => void handleSign(item.orderId)}
                    disabled={!check.allowed || busy}
                    loading={busy || undefined}
                    aria-describedby={check.reason ? reasonId : undefined}
                  >
                    {busy ? "Signing…" : "Approve & sign"}
                  </Button>
                  {check.reason && (
                    <p id={reasonId} className="stat-label" style={{ margin: 0 }}>
                      {check.reason}
                    </p>
                  )}
                  {rowErrors[item.orderId] && (
                    <p role="alert" className="settings-status error" style={{ margin: 0 }}>
                      {rowErrors[item.orderId]}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
