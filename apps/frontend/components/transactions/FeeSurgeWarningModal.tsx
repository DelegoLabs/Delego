"use client";

import { useRef, useState } from "react";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { feeSurgeRatio, type GasFeeEstimate } from "../../lib/feeSurge";

export interface FeeSurgeWarningModalProps {
  isOpen: boolean;
  /** The live fee estimate the warning is built from. */
  estimate: GasFeeEstimate;
  /** The fee the transaction was actually built with, in stroops. */
  transactionFeeStroops?: string;
  /** Approve paying the surge fee and continue with the transaction. */
  onApprove: () => void | Promise<void>;
  /** Postpone the transaction instead of paying the surge fee. */
  onPostpone: () => void;
  /** True while the approved transaction is being submitted. */
  approving?: boolean;
  /** Error raised while submitting, shown above the actions. */
  error?: string | null;
}

const STROOPS_PER_XLM = 10_000_000;

/**
 * Formats a stroop amount for display, e.g. "0.00001 XLM (100 stroops)".
 * Fees are small enough that the app's 2-decimal XLM formatting would round
 * them away, so the raw stroop count is always shown alongside.
 */
function formatFee(stroops: string): string {
  if (!/^\d+$/.test(stroops)) return `${stroops} stroops`;
  try {
    const amount = BigInt(stroops);
    const xlm = Number(amount) / STROOPS_PER_XLM;
    const formatted = xlm.toLocaleString(undefined, { maximumFractionDigits: 7 });
    return `${formatted} XLM (${amount.toLocaleString()} stroops)`;
  } catch {
    return `${stroops} stroops`;
  }
}

/**
 * Gas fee surge warning (#1002).
 *
 * Raised when the network fee for a transaction is above the user's own
 * comfort limit. The user has exactly two ways out: approve the surge fee
 * and continue, or postpone the transaction and try again when fees settle.
 *
 * The copy never hides the numbers — the base fee, the recommended fee, the
 * user's limit and the fee this transaction will pay are all shown, so the
 * decision is informed rather than a blind "are you sure?".
 */
export function FeeSurgeWarningModal({
  isOpen,
  estimate,
  transactionFeeStroops,
  onApprove,
  onPostpone,
  approving = false,
  error = null,
}: FeeSurgeWarningModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useFocusTrap({
    containerRef: panelRef,
    isActive: isOpen,
    onEscape: onPostpone,
  });

  if (!isOpen) return null;

  const ratio = feeSurgeRatio(estimate);
  const message = failure ?? error;

  async function handleApprove() {
    if (busy || approving) return;
    setBusy(true);
    setFailure(null);
    try {
      await onApprove();
    } catch (err) {
      setFailure(
        err instanceof Error ? err.message : "Failed to submit the transaction."
      );
      setBusy(false);
    }
  }

  return (
    <div
      className="approval-drawer-overlay"
      onClick={onPostpone}
      data-testid="fee-surge-backdrop"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fee-surge-warning-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg-surface, #fff)",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          maxWidth: "30rem",
          margin: "8vh auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h2 id="fee-surge-warning-title" style={{ margin: 0 }}>
          Network fees are surging
        </h2>

        <div
          role="alert"
          style={{
            background: "var(--color-warning-bg, #fffbeb)",
            color: "var(--color-warning-text, #92400e)",
            border: "1px solid var(--color-warning-border, #fde68a)",
            borderRadius: "0.5rem",
            padding: "0.75rem",
          }}
        >
          <p style={{ margin: 0 }}>
            {estimate.isSurgeActive
              ? "The Stellar network is congested, so transaction fees are above their normal level. "
              : "Transaction fees are above their normal level. "}
            The recommended fee is above your max fee limit of{" "}
            {formatFee(estimate.userConfiguredMaxFeeStroops)}.
          </p>
        </div>

        <dl className="wallet-detail-list">
          <div className="wallet-detail-row">
            <dt>Network base fee</dt>
            <dd>{formatFee(estimate.baseFeeStroops)}</dd>
          </div>
          <div className="wallet-detail-row">
            <dt>Recommended fee</dt>
            <dd>{formatFee(estimate.recommendedFeeStroops)}</dd>
          </div>
          {transactionFeeStroops && (
            <div className="wallet-detail-row">
              <dt>This transaction pays</dt>
              <dd>{formatFee(transactionFeeStroops)}</dd>
            </div>
          )}
          <div className="wallet-detail-row">
            <dt>Your max fee limit</dt>
            <dd>{formatFee(estimate.userConfiguredMaxFeeStroops)}</dd>
          </div>
          {ratio !== null && ratio > 1 && (
            <div className="wallet-detail-row">
              <dt>Compared with base fee</dt>
              <dd>{`${ratio.toFixed(1)}×`}</dd>
            </div>
          )}
        </dl>

        <p style={{ margin: 0, fontSize: "0.8125rem" }}>
          Approve the surge fee to submit this transaction now, or postpone it
          and try again when the network settles.
        </p>

        {message && (
          <p role="alert" style={{ margin: 0, fontSize: "0.8125rem", color: "#991b1b" }}>
            {message}
          </p>
        )}

        <div className="form-actions">
          <Button variant="ghost" type="button" onClick={onPostpone} disabled={approving}>
            Postpone
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => void handleApprove()}
            disabled={approving}
            loading={approving}
          >
            Approve surge fee
          </Button>
        </div>
      </div>
    </div>
  );
}
