import { useState } from "react";
import { Stepper, Button, Card, FormField } from "@delegolabs/ui";
import type { DisputeReason, DisputeInitiationForm } from "@delegolabs/types";
import { DISPUTE_REASON_OPTIONS } from "../../../lib/disputes";

export interface DisputeWizardProps {
  escrowId: string;
  escrowStatus: string;
  initialData?: Partial<DisputeInitiationForm>;
  onSubmit: (formData: DisputeInitiationForm) => Promise<void> | void;
  onCancel?: () => void;
}

const STEPS = [
  { id: "reason", label: "Reason" },
  { id: "details", label: "Details" },
  { id: "evidence", label: "Evidence" },
  { id: "review", label: "Review" },
];

export function DisputeWizard({
  escrowId,
  escrowStatus,
  initialData,
  onSubmit,
  onCancel,
}: DisputeWizardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [reason, setReason] = useState<DisputeReason>(
    initialData?.reason ?? "item_not_received"
  );
  const [description, setDescription] = useState(
    initialData?.description ?? ""
  );
  const [requestedAction, setRequestedAction] = useState<
    "full_refund" | "partial_refund" | "replacement"
  >(initialData?.requestedAction ?? "full_refund");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>(
    initialData?.evidenceFiles ?? []
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReleasedOrRefunded =
    escrowStatus.toLowerCase() === "released" ||
    escrowStatus.toLowerCase() === "refunded";

  const handleNext = () => {
    if (currentStepIndex === 1 && !description.trim()) {
      setError("Please provide a description of the issue.");
      return;
    }
    setError(null);
    setCurrentStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handlePrev = () => {
    setError(null);
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setEvidenceFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async () => {
    if (isReleasedOrRefunded) {
      setError("Prevents dispute filing after escrow has already been released or refunded.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        escrowId,
        reason,
        description,
        requestedAction,
        evidenceFiles,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit dispute");
    } finally {
      setSubmitting(false);
    }
  };

  if (isReleasedOrRefunded) {
    return (
      <Card style={{ padding: "1.5rem", maxWidth: "600px", margin: "0 auto" }}>
        <h2>Dispute Unavailable</h2>
        <p style={{ color: "#b91c1c", marginTop: "1rem" }}>
          Prevents dispute filing after escrow has already been released or refunded.
        </p>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} style={{ marginTop: "1rem" }}>
            Close
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card style={{ padding: "1.5rem", maxWidth: "700px", margin: "0 auto" }}>
      <h2 style={{ marginBottom: "1rem" }}>File Formal Dispute</h2>
      <Stepper
        steps={STEPS}
        currentIndex={currentStepIndex}
        onStepSelect={(idx) => setCurrentStepIndex(idx)}
      />

      <div style={{ marginTop: "1.5rem", minHeight: "250px" }}>
        {error && (
          <div
            style={{
              padding: "0.75rem",
              background: "#fee2e2",
              color: "#b91c1c",
              borderRadius: "0.375rem",
              marginBottom: "1rem",
            }}
          >
            {error}
          </div>
        )}

        {currentStepIndex === 0 && (
          <div>
            <h3>Select Dispute Reason</h3>
            <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1rem" }}>
              Choose the primary reason for filing this dispute against escrow {escrowId}.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {(
                [
                  { value: "item_not_received", label: "Item Not Received" },
                  { value: "damaged", label: "Damaged Item" },
                  { value: "wrong_item", label: "Wrong Item Received" },
                  { value: "fraudulent", label: "Fraudulent Transaction" },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.75rem",
                    border: "1px solid #e5e7eb",
                    borderRadius: "0.375rem",
                    cursor: "pointer",
                    background: reason === opt.value ? "#eff6ff" : "#fff",
                  }}
                >
                  <input
                    type="radio"
                    name="disputeReason"
                    value={opt.value}
                    checked={reason === opt.value}
                    onChange={() => setReason(opt.value)}
                  />
                  <span style={{ fontWeight: 500 }}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {currentStepIndex === 1 && (
          <div>
            <h3>Describe the Issue & Requested Resolution</h3>
            <div style={{ marginTop: "1rem" }}>
              <label style={{ display: "block", fontWeight: 500, marginBottom: "0.5rem" }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide detailed information regarding your dispute..."
                rows={4}
                style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #d1d5db" }}
              />
            </div>

            <div style={{ marginTop: "1rem" }}>
              <label style={{ display: "block", fontWeight: 500, marginBottom: "0.5rem" }}>
                Requested Resolution Action
              </label>
              <select
                value={requestedAction}
                onChange={(e) =>
                  setRequestedAction(
                    e.target.value as "full_refund" | "partial_refund" | "replacement"
                  )
                }
                style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #d1d5db" }}
              >
                <option value="full_refund">Full Refund</option>
                <option value="partial_refund">Partial Refund</option>
                <option value="replacement">Replacement</option>
              </select>
            </div>
          </div>
        )}

        {currentStepIndex === 2 && (
          <div>
            <h3>Upload Evidence Images</h3>
            <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1rem" }}>
              Upload screenshots, photos, or documents to support your dispute. Images will be securely uploaded to the backend and escrow status will be locked.
            </p>
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              style={{ marginTop: "0.5rem" }}
            />
            {evidenceFiles.length > 0 && (
              <ul style={{ marginTop: "1rem", paddingLeft: "1.25rem" }}>
                {evidenceFiles.map((file, idx) => (
                  <li key={idx} style={{ fontSize: "0.875rem", color: "#374151" }}>
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {currentStepIndex === 3 && (
          <div>
            <h3>Review & Submit Dispute</h3>
            <div style={{ background: "#f9fafb", padding: "1rem", borderRadius: "0.375rem", marginTop: "1rem" }}>
              <p><strong>Escrow ID:</strong> {escrowId}</p>
              <p style={{ marginTop: "0.5rem" }}><strong>Reason:</strong> {reason.replace("_", " ")}</p>
              <p style={{ marginTop: "0.5rem" }}><strong>Description:</strong> {description || "(none provided)"}</p>
              <p style={{ marginTop: "0.5rem" }}><strong>Requested Action:</strong> {requestedAction.replace("_", " ")}</p>
              <p style={{ marginTop: "0.5rem" }}><strong>Evidence Files:</strong> {evidenceFiles.length} file(s) attached</p>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem" }}>
        {onCancel && currentStepIndex === 0 ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={currentStepIndex === 0 ? onCancel : handlePrev}
          >
            {currentStepIndex === 0 ? "Cancel" : "Back"}
          </Button>
        )}

        {currentStepIndex < STEPS.length - 1 ? (
          <Button onClick={handleNext}>Next</Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Dispute"}
          </Button>
        )}
      </div>
    </Card>
  );
}
