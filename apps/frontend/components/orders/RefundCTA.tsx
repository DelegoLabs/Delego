"use client";

import { useCallback, useRef, useState } from "react";
import { Button, Card, StroopsInput } from "@delego/ui";
import type { Order } from "@delego/types";
import { useRefundEligibility } from "../../hooks/useRefundEligibility";
import { useWallet } from "../../hooks/useWallet";
import { RefundTimeline } from "./RefundTimeline";
import type {
  RefundReasonCode,
  RefundRecord,
  RefundRequestPayload,
} from "../../lib/refund";
import {
  ELIGIBILITY_NOT_YET_LABELS,
  REFUND_REASON_CODES,
  REFUND_REASON_LABELS,
  isTerminalRefundStatus,
} from "../../lib/refund";
import { formatXlm } from "../../lib/orders";
import { api } from "../../lib/api";

export interface RefundCTAProps {
  order: Order;
  /** Pre-existing refund record for this order, if one has already been submitted. */
  existingRefund?: RefundRecord | null;
  /** Called after a refund is successfully submitted so the parent can refresh state. */
  onRefundSubmitted?: (payload: RefundRequestPayload) => void;
}

/**
 * Buyer-facing "Request refund" surface.
 *
 * - Queries the escrow contract's read-only eligibility getter via the gateway
 *   and disables (with a tooltip) when the getter says not-yet.
 * - Once eligible, shows a reason dropdown + optional partial-amount input +
 *   evidence textarea.
 * - Renders the RefundTimeline once a record exists, and hides all actions in
 *   terminal states (settled / rejected).
 * - Guarded against double-submission with an in-flight ref.
 */
export function RefundCTA({
  order,
  existingRefund = null,
  onRefundSubmitted,
}: RefundCTAProps) {
  const { address } = useWallet();
  const escrowId = order.escrowContractId ?? null;

  const {
    eligible,
    reason: eligibilityReason,
    loading: eligLoading,
  } = useRefundEligibility(escrowId, address);

  // Form state
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<RefundReasonCode>(
    "item_not_received"
  );
  const [isPartial, setIsPartial] = useState(false);
  const [partialAmountStroops, setPartialAmountStroops] = useState<bigint>(0n);
  const [evidenceNote, setEvidenceNote] = useState("");

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [localRefund, setLocalRefund] = useState<RefundRecord | null>(
    existingRefund ?? null
  );
  // Hard guard: prevents double-submit even if React batching doesn't catch it.
  const inFlightRef = useRef(false);

  const activeRefund = localRefund ?? existingRefund;

  // ── Terminal state: hide all actions once settled or rejected ──────────────
  if (activeRefund && isTerminalRefundStatus(activeRefund.status)) {
    return (
      <Card title="Refund" ariaLabel={`Refund status for order ${order.id}`}>
        <RefundTimeline refund={activeRefund} />
      </Card>
    );
  }

  // ── In-progress state: timeline only, no new submission ───────────────────
  if (activeRefund) {
    return (
      <Card
        title="Refund in progress"
        ariaLabel={`Refund status for order ${order.id}`}
      >
        <RefundTimeline refund={activeRefund} />
      </Card>
    );
  }

  // ── Eligibility tooltip copy ───────────────────────────────────────────────
  const notEligibleReason =
    !eligible && eligibilityReason
      ? (ELIGIBILITY_NOT_YET_LABELS[eligibilityReason] ??
        "You are not eligible to request a refund right now.")
      : null;

  const buttonDisabled =
    eligLoading || eligible === false || submitting || !escrowId;

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (inFlightRef.current || buttonDisabled) return;
      inFlightRef.current = true;
      setSubmitting(true);
      setSubmitError(null);

      const payload: RefundRequestPayload = {
        escrowId: escrowId!,
        orderId: order.id,
        amountStroops:
          isPartial && partialAmountStroops > 0n
            ? partialAmountStroops.toString()
            : null,
        reasonCode,
        evidenceNote: evidenceNote.trim() || undefined,
        requestedAt: new Date().toISOString(),
      };

      try {
        // POST /api/v1/refunds — typed stub; wire to real endpoint when ready.
        const res = await (api as unknown as {
          requestRefund: (
            p: RefundRequestPayload
          ) => Promise<{
            data?: RefundRecord;
            error?: { message: string };
          }>;
        }).requestRefund(payload);

        if (res.error) {
          setSubmitError(res.error.message);
        } else if (res.data) {
          setLocalRefund(res.data);
          setOpen(false);
          onRefundSubmitted?.(payload);
        }
      } catch {
        setSubmitError("Failed to submit refund request. Please try again.");
      } finally {
        setSubmitting(false);
        inFlightRef.current = false;
      }
    },
    [
      buttonDisabled,
      escrowId,
      order.id,
      isPartial,
      partialAmountStroops,
      reasonCode,
      evidenceNote,
      onRefundSubmitted,
    ]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Card
      title="Request a refund"
      ariaLabel={`Request refund for order ${order.id}`}
    >
      {!open ? (
        /* ── CTA button with ineligibility tooltip ── */
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {/*
           * Wrap in a <span> so the title tooltip still fires even when the
           * button itself is disabled (disabled elements don't receive pointer
           * events in some browsers).
           */}
          <span title={notEligibleReason ?? undefined} style={{ display: "inline-block" }}>
            <Button
              variant="primary"
              onClick={() => setOpen(true)}
              disabled={buttonDisabled}
              aria-disabled={buttonDisabled}
              ariaLabel={
                notEligibleReason
                  ? `Request refund — ${notEligibleReason}`
                  : "Request refund"
              }
            >
              {eligLoading ? "Checking eligibility…" : "Request refund"}
            </Button>
          </span>
          {notEligibleReason && (
            <span
              className="stat-label"
              style={{ fontSize: "0.8125rem", color: "#6b7280" }}
              aria-live="polite"
            >
              {notEligibleReason}
            </span>
          )}
        </div>
      ) : (
        /* ── Refund form ── */
        <form className="settings-section" onSubmit={handleSubmit} noValidate>
          {/* Reason select */}
          <div>
            <label
              htmlFor={`refund-reason-${order.id}`}
              style={{ display: "block", fontWeight: 500, marginBottom: "0.25rem" }}
            >
              Reason <span aria-hidden="true">*</span>
            </label>
            <select
              id={`refund-reason-${order.id}`}
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as RefundReasonCode)}
              required
              disabled={submitting}
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "0.375rem",
                border: "1px solid #d1d5db",
              }}
            >
              {REFUND_REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {REFUND_REASON_LABELS[code]}
                </option>
              ))}
            </select>
          </div>

          {/* Partial refund toggle */}
          <div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              <input
                type="checkbox"
                checked={isPartial}
                onChange={(e) => setIsPartial(e.target.checked)}
                disabled={submitting}
              />
              Request partial refund
            </label>
            <p className="stat-label" style={{ marginTop: "0.125rem" }}>
              Full order total is {formatXlm(order.totalStroops)} XLM
            </p>
          </div>

          {/* Partial amount input — only shown when partial is checked */}
          {isPartial && (
            <div>
              <label
                style={{ display: "block", fontWeight: 500, marginBottom: "0.25rem" }}
              >
                Refund amount
              </label>
              <StroopsInput
                value={partialAmountStroops}
                onChange={(v) => setPartialAmountStroops(v)}
                disabled={submitting}
                style={{ width: "100%" }}
              />
            </div>
          )}

          {/* Evidence textarea */}
          <div>
            <label
              htmlFor={`refund-evidence-${order.id}`}
              style={{ display: "block", fontWeight: 500, marginBottom: "0.25rem" }}
            >
              Evidence links / notes
              <span className="stat-label" style={{ fontWeight: 400, marginLeft: "0.5rem" }}>
                (optional)
              </span>
            </label>
            <textarea
              id={`refund-evidence-${order.id}`}
              value={evidenceNote}
              onChange={(e) => setEvidenceNote(e.target.value)}
              rows={3}
              disabled={submitting}
              placeholder="Paste links to screenshots, tracking numbers, or other evidence"
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "0.375rem",
                border: "1px solid #d1d5db",
                resize: "vertical",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          {submitError && (
            <div
              className="settings-status error"
              role="alert"
              aria-live="assertive"
            >
              {submitError}
            </div>
          )}

          <div className="form-actions">
            <Button
              variant="primary"
              type="submit"
              disabled={
                submitting ||
                (isPartial && partialAmountStroops <= 0n)
              }
            >
              {submitting ? "Submitting…" : "Submit refund request"}
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setOpen(false);
                setSubmitError(null);
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
