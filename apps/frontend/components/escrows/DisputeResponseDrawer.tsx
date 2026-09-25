"use client";

import { useState } from "react";
import type { Dispute } from "@delegolabs/types";
import { disputeReasonLabel } from "../../lib/disputes";
import { submitDisputeResponse } from "../../lib/disputeResponses";

export interface DisputeResponseDrawerProps {
  open: boolean;
  dispute: Dispute;
  /**
   * ISO timestamp after which arbitration begins and the merchant can no
   * longer submit a response. Passed explicitly since this isn't yet a field
   * on the shared `Dispute` type.
   */
  arbitrationDeadline: string;
  onClose: () => void;
  onSubmitted: () => void;
}

/**
 * Slide-out drawer letting a merchant review a buyer's dispute claim and
 * submit counter-evidence (and optionally a partial-refund counter-offer)
 * before arbitration begins.
 */
export function DisputeResponseDrawer({
  open,
  dispute,
  arbitrationDeadline,
  onClose,
  onSubmitted,
}: DisputeResponseDrawerProps) {
  const [responseStatement, setResponseStatement] = useState("");
  const [proofOfDeliveryUrl, setProofOfDeliveryUrl] = useState("");
  const [counterOfferStroops, setCounterOfferStroops] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const arbitrationExpired = new Date(arbitrationDeadline).getTime() <= Date.now();
  const canSubmit = responseStatement.trim().length > 0 && !submitting && !arbitrationExpired;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitDisputeResponse({
        disputeId: dispute.id,
        responseStatement,
        proofOfDeliveryUrl: proofOfDeliveryUrl || undefined,
        counterOfferStroops: counterOfferStroops || undefined,
      });
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit response.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Respond to dispute"
      style={{ position: "fixed", inset: 0, zIndex: 50 }}
    >
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          maxWidth: 440,
          background: "#fff",
          padding: "1.25rem",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Respond to dispute</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer" }}>
            ✕
          </button>
        </div>

        <div
          style={{
            padding: "0.75rem",
            borderRadius: "0.5rem",
            background: "#f9fafb",
            fontSize: "0.8125rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.375rem",
          }}
        >
          <strong>Buyer&apos;s claim</strong>
          <span>Reason: {disputeReasonLabel(dispute.reason)}</span>
          {dispute.description && <span>{dispute.description}</span>}
        </div>

        {arbitrationExpired && (
          <p role="alert" style={{ fontSize: "0.8125rem", color: "#dc2626", margin: 0 }}>
            The arbitration period has begun — responses can no longer be submitted.
          </p>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Your response</span>
          <textarea
            value={responseStatement}
            onChange={(e) => setResponseStatement(e.target.value)}
            disabled={arbitrationExpired}
            rows={4}
            style={{ padding: "0.5rem 0.625rem", borderRadius: "0.5rem", border: "1px solid #d1d5db" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Proof of delivery URL (optional)</span>
          <input
            type="url"
            value={proofOfDeliveryUrl}
            onChange={(e) => setProofOfDeliveryUrl(e.target.value)}
            disabled={arbitrationExpired}
            style={{ padding: "0.5rem 0.625rem", borderRadius: "0.5rem", border: "1px solid #d1d5db" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            Partial refund counter-offer, stroops (optional)
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={counterOfferStroops}
            onChange={(e) => setCounterOfferStroops(e.target.value.replace(/[^0-9]/g, ""))}
            disabled={arbitrationExpired}
            style={{ padding: "0.5rem 0.625rem", borderRadius: "0.5rem", border: "1px solid #d1d5db" }}
          />
        </label>

        {error && (
          <p role="alert" style={{ fontSize: "0.75rem", color: "#dc2626", margin: 0 }}>
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            padding: "0.625rem 1rem",
            borderRadius: "0.5rem",
            border: "none",
            background: canSubmit ? "#2563eb" : "#9ca3af",
            color: "#fff",
            fontWeight: 600,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "Submitting…" : "Submit response"}
        </button>
      </div>
    </div>
  );
}
