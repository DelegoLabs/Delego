import type { RefundRecord, RefundStatus } from "../../lib/refund";
import {
  REFUND_LIFECYCLE,
  REFUND_STATUS_LABELS,
  formatRefundAmount,
  refundLifecycleIndex,
} from "../../lib/refund";

export interface RefundTimelineProps {
  refund: RefundRecord;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Activity-timeline style progression for a refund record.
 * Follows the same structural pattern as StatusTimeline so it drops in
 * alongside the existing order tracking view.
 */
export function RefundTimeline({ refund }: RefundTimelineProps) {
  const isRejected = refund.status === "rejected";
  const currentIndex = refundLifecycleIndex(refund.status);

  if (isRejected) {
    return (
      <div className="order-timeline-offpath order-status-disputed">
        <span>Refund rejected</span>
        {refund.rejectionReason && (
          <p className="stat-label" style={{ marginTop: "0.25rem" }}>
            {refund.rejectionReason}
          </p>
        )}
        {refund.resolvedAt && (
          <p className="stat-label">{formatDateTime(refund.resolvedAt)}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <ol className="order-timeline" aria-label="Refund progress">
        {REFUND_LIFECYCLE.map((step: RefundStatus, index: number) => {
          const state =
            index < currentIndex
              ? "complete"
              : index === currentIndex
                ? "current"
                : "upcoming";
          return (
            <li key={step} className={`order-timeline-step is-${state}`}>
              <span className="order-timeline-dot" aria-hidden="true">
                {state === "complete" ? "✓" : index + 1}
              </span>
              <span className="order-timeline-label">
                {REFUND_STATUS_LABELS[step]}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Refund amount summary */}
      <dl className="wallet-detail-list" style={{ marginTop: "0.75rem" }}>
        <div className="wallet-detail-row">
          <dt>Amount</dt>
          <dd>{formatRefundAmount(refund.amountStroops)}</dd>
        </div>
        <div className="wallet-detail-row">
          <dt>Requested</dt>
          <dd>{formatDateTime(refund.requestedAt)}</dd>
        </div>
        {refund.resolvedAt && (
          <div className="wallet-detail-row">
            <dt>Resolved</dt>
            <dd>{formatDateTime(refund.resolvedAt)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
