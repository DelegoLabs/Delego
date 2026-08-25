"use client";

import { useRef, useState } from "react";
import { Card, Tooltip, ActivityTimeline, type ActivityEvent } from "@delego/ui";
import type { Order, RefundEligibilityReason, RefundRequestReasonCode } from "@delego/types";
// Import the browser-safe currency subpath directly, not the package root —
// the root barrel also re-exports Node-only modules (http.ts uses
// node:http, id.ts uses node:crypto) that break the Next.js client bundle
// if pulled in. This is almost certainly why the frontend previously
// duplicated this formatting logic locally instead of importing it.
import { stroopsToDisplay } from "@delego/utils/currency";
import { useWallet } from "../../hooks/useWallet";
import { useRefundEligibility } from "../../hooks/useRefundEligibility";
import { api } from "../../lib/api";

const REASON_OPTIONS: { value: RefundRequestReasonCode; label: string }[] = [
  { value: "buyer_cancelled", label: "I want to cancel this order" },
  { value: "timeout", label: "Order timed out without fulfillment" },
  { value: "merchant_cancelled", label: "Merchant cancelled" },
  { value: "dispute_buyer", label: "Dispute resolved in my favor" },
  { value: "system_error", label: "System error" },
];

/** Eligibility reasons that mean no further refund action is ever possible for this escrow. */
const TERMINAL_ELIGIBILITY_REASONS = new Set<RefundEligibilityReason>([
  "released",
  "refunded",
  "cancelled",
]);

function eligibilityTooltip(reason: RefundEligibilityReason): string {
  switch (reason) {
    case "notfund":
      return "This escrow could not be found.";
    case "released":
      return "Funds have already been released to the seller.";
    case "refunded":
      return "This order has already been refunded.";
    case "cancelled":
      return "This escrow was cancelled.";
    case "unfunded":
      return "This order hasn't been funded into escrow yet.";
    case "disputed":
      return "This order is under dispute — refunds are handled through dispute resolution.";
    case "timeout":
      return "You can request a refund once the order's timeout period has passed.";
    case "noauth":
      return "You're not authorized to refund this order.";
    default:
      return "Refund isn't available for this order right now.";
  }
}

export interface RefundRequestPanelProps {
  order: Order;
}

type SubmitState = "idle" | "submitting" | "succeeded" | "failed";

/**
 * Buyer-facing refund request CTA for an escrowed order. Gates the CTA on
 * the real on-chain get_refund_eligibility getter (see useRefundEligibility),
 * mirroring the disabled-with-tooltip pattern for not-yet-eligible states.
 *
 * The contract/payments-service refund flow is a single synchronous
 * operation (no separate approve/reject step for buyer-initiated refunds),
 * so the timeline models "requested -> settled | failed" rather than the
 * "requested -> approved/rejected -> settled" progression the ticket
 * originally envisioned — that assumes an approval workflow that doesn't
 * exist for this path.
 */
export function RefundRequestPanel({ order }: RefundRequestPanelProps) {
  const { address } = useWallet();
  const { eligibility, loading, error } = useRefundEligibility(order.escrowId, address);
  const [reason, setReason] = useState<RefundRequestReasonCode>("buyer_cancelled");
  // Captured but not yet submitted: RefundEscrowParams (payments service) has no
  // evidence-link field yet. Wiring this in requires a payload change coordinated
  // with the payments service, per the ticket's "coordinate payload before wiring".
  const [evidenceLink, setEvidenceLink] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const submittingRef = useRef(false);

  if (!order.escrowId) {
    return null;
  }

  const hideActions =
    submitState === "succeeded" ||
    (eligibility !== null && TERMINAL_ELIGIBILITY_REASONS.has(eligibility.reason));

  const handleSubmit = async () => {
    if (!address || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitState("submitting");
    setSubmitError(null);
    setEvents((prev) => [
      ...prev,
      {
        id: `requested-${Date.now()}`,
        label: "Refund requested",
        tone: "neutral",
        timestamp: new Date(),
      },
    ]);

    try {
      const res = await api.submitRefundRequest(order.escrowId as string, {
        sourceAddress: address,
        refundReasonCode: reason,
      });

      if (res.error || !res.data) {
        setSubmitState("failed");
        setSubmitError(res.error?.message ?? "Refund request failed");
        setEvents((prev) => [
          ...prev,
          { id: `failed-${Date.now()}`, label: "Refund failed", tone: "negative", timestamp: new Date() },
        ]);
        return;
      }

      setSubmitState("succeeded");
      setEvents((prev) => [
        ...prev,
        {
          id: `settled-${Date.now()}`,
          label: "Refund settled",
          tone: "positive",
          timestamp: new Date(),
          // EscrowOperationResult doesn't yet return the actual refunded amount
          // (full vs. partial) — displays the order total until the payments
          // service returns a settled amount.
          amount: `${stroopsToDisplay(order.totalStroops)} XLM`,
        },
      ]);
    } catch {
      setSubmitState("failed");
      setSubmitError("Refund request failed");
      setEvents((prev) => [
        ...prev,
        { id: `failed-${Date.now()}`, label: "Refund failed", tone: "negative", timestamp: new Date() },
      ]);
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <Card title="Refund" ariaLabel="Refund request">
      {events.length > 0 && <ActivityTimeline events={events} ariaLabel="Refund status" />}

      {!hideActions && (
        <div className="settings-section">
          {loading && <p className="stat-label">Checking refund eligibility…</p>}
          {error && (
            <p className="settings-status error" role="alert">
              {error}
            </p>
          )}

          {!loading && !error && (
            <>
              <label htmlFor={`refund-reason-${order.id}`}>Reason</label>
              <select
                id={`refund-reason-${order.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value as RefundRequestReasonCode)}
                disabled={submitState === "submitting"}
              >
                {REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <label htmlFor={`refund-evidence-${order.id}`}>Evidence link (optional)</label>
              <input
                id={`refund-evidence-${order.id}`}
                type="url"
                placeholder="https://…"
                value={evidenceLink}
                onChange={(e) => setEvidenceLink(e.target.value)}
                disabled={submitState === "submitting"}
              />

              {submitError && (
                <p className="settings-status error" role="alert">
                  {submitError}
                </p>
              )}

              {eligibility?.eligible ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitState === "submitting" || !address}
                >
                  {submitState === "submitting" ? "Requesting…" : "Request refund"}
                </button>
              ) : (
                <Tooltip content={eligibilityTooltip(eligibility?.reason ?? "noauth")}>
                  <button type="button" disabled>
                    Request refund
                  </button>
                </Tooltip>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
