"use client";

import Link from "next/link";
import { DisputeEvidenceComparison } from "../../../../components/escrows/DisputeEvidenceComparison";
import { useDisputeEvidence } from "../../../../hooks/useDisputeEvidence";

export interface DisputeEvidenceClientProps {
  escrowId: string;
}

export function DisputeEvidenceClient({ escrowId }: DisputeEvidenceClientProps) {
  const {
    evidence,
    loading,
    error,
    notFound,
    feedback,
    dismissFeedback,
    requestMoreEvidence,
    refresh,
  } = useDisputeEvidence(escrowId);

  if (loading) {
    return (
      <div role="status" aria-live="polite" style={{ padding: "2rem 0", color: "#4b5563" }}>
        Loading dispute evidence…
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        style={{
          padding: "1.5rem",
          borderRadius: "0.5rem",
          border: "1px solid #fecaca",
          background: "#fef2f2",
          color: "#991b1b",
        }}
      >
        <p style={{ margin: "0 0 1rem 0", fontWeight: 600 }}>Unable to load dispute evidence</p>
        <p style={{ margin: "0 0 1rem 0" }}>{error}</p>
        <button
          type="button"
          onClick={() => {
            void refresh();
          }}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.375rem",
            border: "1px solid #dc2626",
            background: "#fff",
            color: "#991b1b",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (notFound || !evidence) {
    return (
      <div
        role="status"
        style={{
          padding: "1.5rem",
          borderRadius: "0.5rem",
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          color: "#374151",
        }}
      >
        <p style={{ margin: "0 0 0.5rem 0", fontWeight: 600 }}>Dispute evidence not found</p>
        <p style={{ margin: "0 0 1rem 0" }}>
          No dispute evidence bundle exists for escrow <code>{escrowId}</code>.
        </p>
        <Link href={`/escrows/${encodeURIComponent(escrowId)}`}>Return to escrow</Link>
      </div>
    );
  }

  return (
    <div>
      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          aria-live="polite"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            padding: "0.875rem 1rem",
            marginBottom: "1.25rem",
            borderRadius: "0.5rem",
            border:
              feedback.type === "error" ? "1px solid #fecaca" : "1px solid #a7f3d0",
            background: feedback.type === "error" ? "#fef2f2" : "#ecfdf5",
            color: feedback.type === "error" ? "#991b1b" : "#065f46",
          }}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={dismissFeedback}
            aria-label="Dismiss notification"
            style={{
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <DisputeEvidenceComparison
        evidence={evidence}
        resolutionDeadline={evidence.resolutionDeadline}
        onRequestMoreEvidence={() => {
          void requestMoreEvidence();
        }}
      />
    </div>
  );
}
