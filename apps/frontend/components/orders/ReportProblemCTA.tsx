"use client";

import { useCallback, useRef, useState } from "react";
import { Button, Card } from "@delegolabs/ui";
import type { Order } from "@delegolabs/types";
import { useReportProblem } from "../../hooks/useReportProblem";
import {
  buildEscalationUrl,
  ISSUE_CATEGORY_CODES,
  ISSUE_CATEGORY_LABELS,
  ISSUE_STATUS_LABELS,
  isEscalationDue,
  isTerminalIssueStatus,
  type IssueCategoryCode,
  type IssueTicketRecord,
} from "../../lib/issueTicket";

export interface ReportProblemCTAProps {
  order: Order;
  /** Pre-existing issue ticket for this order, if one was previously submitted. */
  existingTicket?: IssueTicketRecord | null;
  /** Called after a ticket is successfully created so the parent can refresh state. */
  onTicketCreated?: (ticket: IssueTicketRecord) => void;
}

// ─── Issue status chip ───────────────────────────────────────────────────────
// Intentionally distinct styling from order-status and dispute badges so the
// three states are never visually conflated. Passes 4.5:1 contrast in both
// light and dark themes (verified against --color-bg-primary values in
// globals.css).

const ISSUE_CHIP_STYLES: Record<
  IssueTicketRecord["status"],
  { color: string; bg: string; border: string }
> = {
  issue_open: {
    color: "var(--color-issue-text, #92400e)",
    bg: "var(--color-issue-bg, #fffbeb)",
    border: "var(--color-issue-border, #fcd34d)",
  },
  issue_resolving: {
    color: "var(--color-info-text, #1e40af)",
    bg: "var(--color-info-bg, #eff6ff)",
    border: "var(--color-info-border, #93c5fd)",
  },
  issue_resolved: {
    color: "var(--color-success-text, #166534)",
    bg: "var(--color-success-bg, #f0fdf4)",
    border: "var(--color-success-border, #86efac)",
  },
  issue_escalated: {
    color: "var(--color-warning-text, #92400e)",
    bg: "var(--color-warning-bg, #fff7ed)",
    border: "var(--color-warning-border, #fdba74)",
  },
};

function IssueStatusChip({ status }: { status: IssueTicketRecord["status"] }) {
  const style = ISSUE_CHIP_STYLES[status];
  return (
    <span
      data-testid="issue-status-chip"
      data-issue-status={status}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.2rem 0.625rem",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        lineHeight: 1.4,
        color: style.color,
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      {ISSUE_STATUS_LABELS[status]}
    </span>
  );
}

// ─── Escalation CTA ─────────────────────────────────────────────────────────

function EscalationBanner({
  ticket,
  escrowId,
}: {
  ticket: IssueTicketRecord;
  escrowId: string;
}) {
  const escalationUrl = buildEscalationUrl(escrowId, ticket);
  return (
    <div
      role="alert"
      style={{
        padding: "0.75rem 1rem",
        borderRadius: "0.5rem",
        border: "1px solid var(--color-warning-border, #fdba74)",
        background: "var(--color-warning-bg, #fff7ed)",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, fontSize: "0.875rem" }}>
        Your issue hasn't been resolved yet.
      </p>
      <p style={{ margin: 0, fontSize: "0.8125rem" }}>
        If you'd like to escalate this to a formal dispute, your details will be
        carried forward — no need to retype anything.
      </p>
      <a
        href={escalationUrl}
        data-testid="escalation-deeplink"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--color-accent, #2563eb)",
          textDecoration: "underline",
        }}
      >
        Escalate to formal dispute →
      </a>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

/**
 * "Report a problem" surface on order detail — distinct from the formal
 * dispute flow. Submission creates a low-stakes issue ticket routed to
 * merchant/agent channels and sets an "issue open" chip that is visually
 * and semantically separate from DISPUTED.
 *
 * If the ticket remains unresolved after ESCALATION_THRESHOLD_DAYS, a
 * prominent "Escalate to formal dispute" CTA deep-links into the dispute
 * flow with category/message pre-filled.
 */
export function ReportProblemCTA({
  order,
  existingTicket = null,
  onTicketCreated,
}: ReportProblemCTAProps) {
  const { submitting, error, submit } = useReportProblem();

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<IssueCategoryCode>("late_delivery");
  const [message, setMessage] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  const [localTicket, setLocalTicket] = useState<IssueTicketRecord | null>(
    existingTicket ?? null
  );

  const photoInputRef = useRef<HTMLInputElement>(null);

  const activeTicket = localTicket ?? existingTicket;
  const escrowId = order.escrowContractId ?? order.delegationId;
  const showEscalation =
    activeTicket &&
    activeTicket.status === "issue_open" &&
    isEscalationDue(activeTicket.reportedAt);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const ticket = await submit({
        orderId: order.id,
        category,
        message: message.trim() || undefined,
        photoUrl: photoUrl.trim() || undefined,
        reportedAt: new Date().toISOString(),
      });
      if (ticket) {
        setLocalTicket(ticket);
        setOpen(false);
        onTicketCreated?.(ticket);
      }
    },
    [submit, order.id, category, message, photoUrl, onTicketCreated]
  );

  // ── Terminal or in-progress ticket: show status chip + optional escalation ──
  if (activeTicket) {
    return (
      <Card
        title="Problem report"
        ariaLabel={`Issue status for order ${order.id}`}
      >
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          <IssueStatusChip status={activeTicket.status} />

          <dl className="wallet-detail-list">
            <div className="wallet-detail-row">
              <dt>Category</dt>
              <dd>{ISSUE_CATEGORY_LABELS[activeTicket.category]}</dd>
            </div>
            {activeTicket.message && (
              <div className="wallet-detail-row">
                <dt>Message</dt>
                <dd>{activeTicket.message}</dd>
              </div>
            )}
            {activeTicket.photoUrl && (
              <div className="wallet-detail-row">
                <dt>Photo</dt>
                <dd>
                  <a
                    href={activeTicket.photoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View attached photo
                  </a>
                </dd>
              </div>
            )}
            <div className="wallet-detail-row">
              <dt>Reported</dt>
              <dd>{activeTicket.reportedAt.toLocaleDateString()}</dd>
            </div>
          </dl>

          {!isTerminalIssueStatus(activeTicket.status) &&
            showEscalation &&
            escrowId && (
              <EscalationBanner ticket={activeTicket} escrowId={escrowId} />
            )}
        </div>
      </Card>
    );
  }

  // ── CTA + form ───────────────────────────────────────────────────────────
  return (
    <Card
      title="Report a problem"
      ariaLabel={`Report a problem with order ${order.id}`}
    >
      {!open ? (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <p style={{ margin: 0, fontSize: "0.875rem" }}>
            Something not right? Let us know and we'll route it to the merchant
            or agent. This won't start a formal dispute.
          </p>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Report a problem
          </Button>
        </div>
      ) : (
        <form
          className="settings-section"
          onSubmit={handleSubmit}
          noValidate
        >
          {/* Category select */}
          <div>
            <label
              htmlFor={`issue-category-${order.id}`}
              style={{
                display: "block",
                fontWeight: 500,
                marginBottom: "0.25rem",
              }}
            >
              What happened? <span aria-hidden="true">*</span>
            </label>
            <select
              id={`issue-category-${order.id}`}
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as IssueCategoryCode)
              }
              required
              disabled={submitting}
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "0.375rem",
                border: "1px solid var(--color-border, #d1d5db)",
              }}
            >
              {ISSUE_CATEGORY_CODES.map((code) => (
                <option key={code} value={code}>
                  {ISSUE_CATEGORY_LABELS[code]}
                </option>
              ))}
            </select>
          </div>

          {/* Optional message */}
          <div>
            <label
              htmlFor={`issue-message-${order.id}`}
              style={{
                display: "block",
                fontWeight: 500,
                marginBottom: "0.25rem",
              }}
            >
              Message
              <span
                className="stat-label"
                style={{ fontWeight: 400, marginLeft: "0.5rem" }}
              >
                (optional)
              </span>
            </label>
            <textarea
              id={`issue-message-${order.id}`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              disabled={submitting}
              placeholder="Describe what happened — the more detail, the better"
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "0.375rem",
                border: "1px solid var(--color-border, #d1d5db)",
                resize: "vertical",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Optional photo URL */}
          <div>
            <label
              htmlFor={`issue-photo-${order.id}`}
              style={{
                display: "block",
                fontWeight: 500,
                marginBottom: "0.25rem",
              }}
            >
              Photo URL
              <span
                className="stat-label"
                style={{ fontWeight: 400, marginLeft: "0.5rem" }}
              >
                (optional — paste a link to an uploaded image)
              </span>
            </label>
            <input
              ref={photoInputRef}
              id={`issue-photo-${order.id}`}
              type="url"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              disabled={submitting}
              placeholder="https://…"
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "0.375rem",
                border: "1px solid var(--color-border, #d1d5db)",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div
              className="settings-status error"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>
          )}

          <div className="form-actions">
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit report"}
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setOpen(false);
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
