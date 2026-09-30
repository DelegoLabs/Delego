"use client";

import { useState } from "react";
import { Amount, Badge, Button, Card } from "@delegolabs/ui";
import type { PurchaseProposal, PurchaseProposalCardProps } from "../../types/proposal";
import { useNow } from "../../hooks/useNow";
import {
  useDemoModeGuard,
  DEMO_MODE_BLOCKED_MESSAGE,
} from "../../hooks/useDemoModeGuard";

export type { PurchaseProposal, PurchaseProposalCardProps };

/** Format a countdown duration (ms) as "2h 30m", "45m", "Expired", etc. */
function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSeconds = Math.floor(ms / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Shorten a Stellar address for display: "GABC…XYZ1" */
function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Interactive purchase-proposal card rendered inside the agent chat (#678).
 *
 * - Shows item title, amount, merchant, delivery estimate, and remaining
 *   spending-limit headroom.
 * - Displays a live countdown badge that turns urgent (red) in the last
 *   5 minutes before the proposal expires.
 * - Approve triggers a transaction-preview modal when `requiresApproval`
 *   is true (i.e. a signature is required for the escrow).
 * - Decline expands an optional free-text reason field before confirming.
 * - Both buttons become disabled once the proposal is approved, declined,
 *   or expired.
 */
export function PurchaseProposalCard({
  proposal,
  onApprove,
  onDecline,
}: PurchaseProposalCardProps) {
  const now = useNow(1_000);
  const { isDemoMode, guard } = useDemoModeGuard();

  // Local UI state
  const [status, setStatus] = useState<"idle" | "approving" | "declining" | "approved" | "declined">("idle");
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const expiresAtMs = new Date(proposal.expiresAt).getTime();
  const remainingMs = expiresAtMs - now.getTime();
  const isExpired = remainingMs <= 0;
  const isUrgent = remainingMs > 0 && remainingMs <= 5 * 60 * 1_000; // < 5 min

  const isSettled = status === "approved" || status === "declined" || isExpired;
  const isPending = status === "approving" || status === "declining";

  const disabled = isSettled || isPending || isDemoMode;
  const actionTitle = isDemoMode
    ? DEMO_MODE_BLOCKED_MESSAGE
    : isExpired
      ? "This proposal has expired"
      : isSettled
        ? "This proposal has already been actioned"
        : undefined;

  // ── Approve ─────────────────────────────────────────────────────────────

  /**
   * If `requiresApproval` (signature required), show a transaction-preview
   * modal first. The preview modal calls `commitApprove` on confirmation.
   */
  const handleApproveClick = guard(() => {
    if (proposal.requiresApproval) {
      setShowPreview(true);
    } else {
      void commitApprove();
    }
  });

  const commitApprove = guard(async () => {
    setShowPreview(false);
    setStatus("approving");
    try {
      await onApprove(proposal.proposalId);
      setStatus("approved");
    } catch {
      setStatus("idle");
    }
  });

  // ── Decline ─────────────────────────────────────────────────────────────

  const handleConfirmDecline = guard(async () => {
    setStatus("declining");
    try {
      await onDecline(proposal.proposalId, declineReason.trim() || undefined);
      setStatus("declined");
      setDeclining(false);
    } catch {
      setStatus("idle");
    }
  });

  // ── Countdown badge tone ─────────────────────────────────────────────────

  const countdownTone = isExpired ? "error" : isUrgent ? "warning" : "info";

  // ── Amount stroops (string → bigint) ────────────────────────────────────

  const amountStroops = BigInt(proposal.amountStroops);
  const remainingStroops = BigInt(proposal.spendingLimitRemainingStroops);

  return (
    <>
      <Card
        ariaLabel={`Purchase proposal for ${proposal.itemTitle}`}
        data-testid="purchase-proposal-card"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>

          {/* ── Header: title + countdown ───────────────────────────────── */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <span
              style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#111827" }}
              data-testid="proposal-item-title"
            >
              {proposal.itemTitle}
            </span>

            <Badge
              tone={countdownTone}
              data-testid="proposal-countdown"
              aria-label={`Proposal expires in ${formatCountdown(remainingMs)}`}
            >
              {isExpired ? "Expired" : `Expires in ${formatCountdown(remainingMs)}`}
            </Badge>
          </div>

          {/* ── Status badge (approved / declined) ──────────────────────── */}
          {(status === "approved" || status === "declined") && (
            <Badge
              tone={status === "approved" ? "success" : "neutral"}
              data-testid="proposal-settled-badge"
            >
              {status === "approved" ? "Approved" : "Declined"}
            </Badge>
          )}

          {/* ── Detail rows ─────────────────────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "0.5rem",
              fontSize: "0.8125rem",
              color: "#6b7280",
            }}
          >
            <div>
              <span style={{ fontWeight: 500, color: "#9ca3af" }}>Amount</span>
              <br />
              <strong
                style={{ fontSize: "1rem", color: "#111827" }}
                data-testid="proposal-amount"
              >
                <Amount stroops={amountStroops} currency="XLM" />
                {" "}
                <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                  {proposal.assetCode}
                </span>
              </strong>
            </div>

            <div>
              <span style={{ fontWeight: 500, color: "#9ca3af" }}>Merchant</span>
              <br />
              <span title={proposal.merchantAddress}>
                {shortenAddress(proposal.merchantAddress)}
              </span>
            </div>

            <div>
              <span style={{ fontWeight: 500, color: "#9ca3af" }}>Est. delivery</span>
              <br />
              <span data-testid="proposal-delivery">
                {proposal.estimatedDeliveryDays === 1
                  ? "1 day"
                  : `${proposal.estimatedDeliveryDays} days`}
              </span>
            </div>

            <div>
              <span style={{ fontWeight: 500, color: "#9ca3af" }}>Spending limit left</span>
              <br />
              <span data-testid="proposal-spending-limit">
                <Amount stroops={remainingStroops} currency="XLM" />
              </span>
            </div>
          </div>

          {/* ── Signature-required hint ──────────────────────────────────── */}
          {proposal.requiresApproval && !isSettled && (
            <p
              style={{
                margin: 0,
                fontSize: "0.75rem",
                color: "#92400e",
                background: "#fef3c7",
                borderRadius: "0.375rem",
                padding: "0.375rem 0.625rem",
              }}
              data-testid="proposal-requires-approval-hint"
            >
              ⚠ This purchase requires your wallet signature before the escrow is funded.
            </p>
          )}

          {/* ── Decline reason field ─────────────────────────────────────── */}
          {declining && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
              data-testid="decline-reason-form"
            >
              <label
                htmlFor={`decline-reason-${proposal.proposalId}`}
                style={{ fontSize: "0.8125rem", color: "#374151", fontWeight: 500 }}
              >
                Reason for declining (optional)
              </label>
              <input
                id={`decline-reason-${proposal.proposalId}`}
                type="text"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. Price too high, wrong item…"
                disabled={isPending}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.375rem",
                  border: "1px solid #d1d5db",
                  fontSize: "0.875rem",
                  color: "#111827",
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          {/* ── Action buttons ───────────────────────────────────────────── */}
          {!isSettled && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
              data-testid="proposal-actions"
            >
              {declining ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setDeclining(false);
                      setDeclineReason("");
                    }}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleConfirmDecline}
                    disabled={disabled}
                    loading={status === "declining"}
                    data-testid="confirm-decline-button"
                  >
                    Confirm Decline
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDeclining(true)}
                    disabled={disabled}
                    title={actionTitle}
                    data-testid="decline-button"
                  >
                    Decline
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleApproveClick}
                    disabled={disabled}
                    loading={status === "approving"}
                    title={actionTitle}
                    data-testid="approve-button"
                  >
                    {proposal.requiresApproval ? "Review & Approve" : "Approve"}
                  </Button>
                </>
              )}
            </div>
          )}

          {/* ── Disabled-state overlay hint ──────────────────────────────── */}
          {isSettled && (
            <p
              style={{
                margin: 0,
                fontSize: "0.75rem",
                color: "#9ca3af",
                textAlign: "right",
              }}
              data-testid="proposal-disabled-hint"
            >
              {isExpired && status === "idle"
                ? "Proposal expired — no action possible."
                : status === "approved"
                  ? "You approved this proposal."
                  : "You declined this proposal."}
            </p>
          )}
        </div>
      </Card>

      {/* ── Transaction-preview modal ──────────────────────────────────── */}
      {showPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tx-preview-title"
          data-testid="tx-preview-modal"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.45)",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "0.75rem",
              padding: "1.5rem",
              maxWidth: "420px",
              width: "90vw",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <h2
              id="tx-preview-title"
              style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "#111827" }}
            >
              Confirm transaction
            </h2>

            <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>
              Approving this proposal will fund an escrow for:
            </p>

            <dl
              style={{
                margin: 0,
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "0.375rem 1rem",
                fontSize: "0.875rem",
              }}
            >
              <dt style={{ color: "#9ca3af", fontWeight: 500 }}>Item</dt>
              <dd style={{ margin: 0 }} data-testid="tx-preview-item">{proposal.itemTitle}</dd>

              <dt style={{ color: "#9ca3af", fontWeight: 500 }}>Amount</dt>
              <dd style={{ margin: 0 }} data-testid="tx-preview-amount">
                <Amount stroops={amountStroops} currency="XLM" />
                {" "}{proposal.assetCode}
              </dd>

              <dt style={{ color: "#9ca3af", fontWeight: 500 }}>Merchant</dt>
              <dd style={{ margin: 0 }} title={proposal.merchantAddress}>
                {shortenAddress(proposal.merchantAddress)}
              </dd>
            </dl>

            <p
              style={{
                margin: 0,
                fontSize: "0.75rem",
                color: "#92400e",
                background: "#fef3c7",
                borderRadius: "0.375rem",
                padding: "0.375rem 0.625rem",
              }}
            >
              Your wallet will prompt you to sign this transaction.
            </p>

            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowPreview(false)}
                data-testid="tx-preview-cancel"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={commitApprove}
                data-testid="tx-preview-confirm"
              >
                Sign &amp; Approve
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
