"use client";

import { useEffect, useState } from "react";
import { Card } from "@delegolabs/ui";
import {
  subscribeTxStatus,
  PENDING_WARNING_MS,
  type TxStatusUpdate,
} from "../../services/txMonitor";

export interface TransactionStatusCardProps {
  /** The transaction hash to monitor. */
  hash: string;
  /** Horizon base URL, used to build the block-explorer deep link. */
  horizonUrl: string;
  /** Whether this is a live network (affects explorer subdomain). */
  isLiveNetwork: boolean;
  /** Called when the transaction reaches a terminal state so the parent can
   *  remove this card from the UI. */
  onSettled?: (hash: string, status: "success" | "failed" | "timeout") => void;
}

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function buildExplorerUrl(hash: string, isLive: boolean): string {
  const base = isLive
    ? "https://stellar.expert/explorer/public"
    : "https://stellar.expert/explorer/testnet";
  return `${base}/tx/${hash}`;
}

/**
 * Inline status card for a pending Stellar transaction (#583).
 *
 * Subscribes to txMonitor updates and renders:
 *  - Before 60 s: a compact "Pending" indicator.
 *  - After 60 s: an expanded warning with elapsed time, explorer link, and
 *    safe fee-bump guidance.
 *  - On success/failure/timeout: brief result state, then calls onSettled.
 */
export function TransactionStatusCard({
  hash,
  horizonUrl,
  isLiveNetwork,
  onSettled,
}: TransactionStatusCardProps) {
  const [update, setUpdate] = useState<TxStatusUpdate | null>(null);

  useEffect(() => {
    const unsub = subscribeTxStatus((u) => {
      if (u.hash !== hash) return;
      setUpdate(u);
      if (
        u.status === "success" ||
        u.status === "failed" ||
        u.status === "timeout"
      ) {
        onSettled?.(hash, u.status);
      }
    });
    return unsub;
  }, [hash, onSettled]);

  // Nothing to show until the first update arrives.
  if (!update) return null;

  const { status, elapsedMs } = update;
  const isPropagating = status === "pending";
  const isWarning = isPropagating && elapsedMs >= PENDING_WARNING_MS;
  const explorerUrl = buildExplorerUrl(hash, isLiveNetwork);
  const shortHash = `${hash.slice(0, 8)}…${hash.slice(-6)}`;

  if (status === "success") {
    return (
      <div className="tx-status-card tx-status-success" role="status">
        <span>✓ Transaction confirmed</span>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="tx-status-card tx-status-failed" role="alert">
        <span>✗ Transaction failed</span>
      </div>
    );
  }

  if (status === "timeout") {
    return (
      <div className="tx-status-card tx-status-timeout" role="alert">
        <span>
          Transaction timed out after {formatElapsed(elapsedMs)}.{" "}
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
            Check on explorer ↗
          </a>
        </span>
      </div>
    );
  }

  // Pending — compact or expanded depending on elapsed time.
  if (!isWarning) {
    return (
      <div className="tx-status-card tx-status-pending" role="status">
        <span className="tx-spinner" aria-hidden="true" />
        <span>Transaction pending…</span>
      </div>
    );
  }

  // Expanded warning after 60 s.
  return (
    <Card ariaLabel={`Pending transaction ${shortHash}`}>
      <div className="tx-status-warning">
        <div className="tx-status-warning-header">
          <span className="tx-spinner" aria-hidden="true" />
          <strong>Still propagating</strong>
        </div>

        <dl className="tx-status-details">
          <div>
            <dt>Elapsed</dt>
            <dd>{formatElapsed(elapsedMs)}</dd>
          </div>
          <div>
            <dt>Transaction</dt>
            <dd>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View transaction ${shortHash} on block explorer`}
              >
                {shortHash} ↗
              </a>
            </dd>
          </div>
        </dl>

        <p className="tx-status-guidance">
          <strong>Do not resend.</strong> Your transaction was submitted and is
          awaiting inclusion in a ledger. If it remains stuck, use your
          wallet&apos;s fee-bump feature to increase the fee — do not submit a
          new transaction.
        </p>
      </div>
    </Card>
  );
}
