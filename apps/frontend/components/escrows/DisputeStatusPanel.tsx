"use client";

import { ActivityTimeline, Badge, Card } from "@delegolabs/ui";
import type { ActivityTimelineEvent, BadgeTone } from "@delegolabs/ui";
import type { Dispute, DisputeStatus, Escrow } from "@delegolabs/types";
import { DISPUTE_STATUS_LABELS, disputeReasonLabel } from "../../lib/disputes";

export interface DisputeStatusPanelProps {
  escrow: Escrow;
  dispute: Dispute | null;
  /** True right after a local optimistic submission, before `dispute` reflects the server's record. */
  optimistic?: boolean;
}

const STATUS_TONE: Record<DisputeStatus, BadgeTone> = {
  open: "warning",
  under_review: "info",
  resolved_buyer: "success",
  resolved_seller: "success",
  resolved_split: "success",
};

/**
 * Arbiter/status detail for a disputed escrow, plus any resolution events —
 * exposed via the contract's admin/arbiter getter and surfaced here once a
 * dispute exists (or was just optimistically submitted).
 */
export function DisputeStatusPanel({ escrow, dispute, optimistic }: DisputeStatusPanelProps) {
  const events: ActivityTimelineEvent[] = [];

  if (dispute) {
    events.push({
      id: `${dispute.id}-opened`,
      type: "dispute_opened",
      title: "Dispute opened",
      description: disputeReasonLabel(dispute.reason),
      timestamp: new Date(dispute.createdAt),
      tone: "pending",
    });
    if (dispute.resolvedAt) {
      events.push({
        id: `${dispute.id}-resolved`,
        type: "dispute_resolved",
        title: DISPUTE_STATUS_LABELS[dispute.status],
        description: dispute.resolutionNote ?? undefined,
        timestamp: new Date(dispute.resolvedAt),
        tone: "success",
      });
    }
  }

  return (
    <Card title="Dispute" ariaLabel={`Dispute status for escrow ${escrow.escrowId}`}>
      <div className="dispute-status-panel">
        <Badge tone={dispute ? STATUS_TONE[dispute.status] : "warning"}>
          {dispute ? DISPUTE_STATUS_LABELS[dispute.status] : optimistic ? "Submitting…" : "Disputed"}
        </Badge>

        <dl className="wallet-detail-list">
          <div className="wallet-detail-row">
            <dt>Arbiter</dt>
            <dd>{dispute?.arbiter ?? escrow.arbiter ?? "Not yet assigned"}</dd>
          </div>
          {dispute && (
            <div className="wallet-detail-row">
              <dt>Reason</dt>
              <dd>{disputeReasonLabel(dispute.reason)}</dd>
            </div>
          )}
          {dispute?.description && (
            <div className="wallet-detail-row">
              <dt>Description</dt>
              <dd>{dispute.description}</dd>
            </div>
          )}
          {dispute && dispute.evidenceUrls.length > 0 && (
            <div className="wallet-detail-row">
              <dt>Evidence</dt>
              <dd>
                <ul className="approval-evidence-list">
                  {dispute.evidenceUrls.map((url) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>

        {events.length > 0 && (
          <ActivityTimeline events={events} ariaLabel="Dispute resolution events" />
        )}
      </div>
    </Card>
  );
}
