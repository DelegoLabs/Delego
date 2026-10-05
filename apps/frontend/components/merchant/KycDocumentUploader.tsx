'use client';

import { useCallback, useRef, useState } from "react";
import {
  useKycUpload,
  type KycDocumentType,
  type KycUploadResult,
} from "../../hooks/useKycUpload";
import { useKycStatus, type KycVerificationStatus } from "../../hooks/useKycStatus";

export interface KycUploaderProps {
  merchantId: string;
  /** Optional gateway API base URL. Defaults to the app's `/api` prefix. */
  apiBaseUrl?: string;
  /** Optional callback invoked after a successful upload. */
  onUploaded?: (result: KycUploadResult) => void;
}

const DOCUMENT_OPTIONS: { value: KycDocumentType; label: string }[] = [
  { value: "passport", label: "Passport" },
  { value: "id_card", label: "ID card" },
  { value: "business_license", label: "Business license" },
];

const ACCEPTED_TYPES = "image/png,image/jpeg,application/pdf";
const MAX_BYTES = 10 * 1024 * 1024;

function formatStatus(status: KycVerificationStatus): string {
  switch (status) {
    case "verified":
      return "Verified";
    case "rejected":
      return "Rejected";
    default:
      return "Pending review";
  }
}

function statusColor(status: KycVerificationStatus): string {
  switch (status) {
    case "verified":
      return "#166534";
    case "rejected":
      return "#dc2626";
    default:
      return "#b45309";
  }
}

export function KycDocumentUploader({ merchantId, apiBaseUrl, onUploaded }: KycUploaderProps) {
  const [documentType, setDocumentType] = useState<KycDocumentType>("passport");
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleUploaded = useCallback(
    (result: KycUploadResult) => {
      setDocumentId(result.documentId);
      onUploaded?.(result);
    },
    [onUploaded],
  );

  const { phase, progress, error, upload, reset } = useKycUpload({
    apiBaseUrl,
    onUploaded: handleUploaded,
  });

  const { state: verification, isPolling, error: statusError } = useKycStatus(documentId, {
    apiBaseUrl,
    enabled: Boolean(documentId),
  });

  const busy = phase === "encrypting" || phase === "uploading";

  function validate(candidate: File): boolean {
    if (!ACCEPTED_TYPES.split(",").includes(candidate.type)) {
      setValidationError("Upload a PNG, JPEG, or PDF document.");
      return false;
    }
    if (candidate.size > MAX_BYTES) {
      setValidationError("Documents must be 10 MB or smaller.");
      return false;
    }
    setValidationError(null);
    return true;
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const candidate = event.target.files?.[0] ?? null;
    if (!candidate) {
      setFile(null);
      return;
    }
    if (!validate(candidate)) {
      setFile(null);
      return;
    }
    setFile(candidate);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setValidationError("Select a document to upload.");
      return;
    }
    setDocumentId(null);
    await upload({ documentType, file, merchantId });
  }

  function handleReset() {
    reset();
    setFile(null);
    setDocumentId(null);
    setValidationError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section
      aria-labelledby="kyc-uploader-title"
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 520 }}
    >
      <h2 id="kyc-uploader-title" style={{ margin: 0, fontSize: "1rem" }}>
        Tier-2 verification documents
      </h2>
      <p style={{ fontSize: "0.8125rem", color: "#374151", margin: 0 }}>
        Upload an identity document to unlock tier-2 trading. Files are encrypted in your
        browser before they leave your device.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Document type</span>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as KycDocumentType)}
            disabled={busy}
            style={{ padding: "0.5rem 0.625rem", borderRadius: "0.5rem", border: "1px solid #d1d5db" }}
          >
            {DOCUMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Document file</span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileChange}
            disabled={busy}
            data-testid="kyc-file-input"
            style={{ fontSize: "0.8125rem" }}
          />
        </label>

        {validationError && (
          <p role="alert" style={{ fontSize: "0.75rem", color: "#dc2626", margin: 0 }}>
            {validationError}
          </p>
        )}

        {busy && (
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={phase === "encrypting" ? "Encrypting document" : "Uploading document"}
            data-testid="kyc-progress"
            style={{ width: "100%", height: 8, background: "#e5e7eb", borderRadius: 9999, overflow: "hidden" }}
          >
            <div
              style={{
                width: `${phase === "encrypting" ? 10 : progress}%`,
                height: "100%",
                background: "#2563eb",
                transition: "width 150ms ease-out",
              }}
            />
          </div>
        )}

        {busy && (
          <p style={{ fontSize: "0.75rem", color: "#374151", margin: 0 }}>
            {phase === "encrypting" ? "Encrypting document in your browser…" : `Uploading… ${progress}%`}
          </p>
        )}

        {error && (
          <p role="alert" style={{ fontSize: "0.75rem", color: "#dc2626", margin: 0 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="submit"
            disabled={busy || !file}
            style={{
              padding: "0.625rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: busy || !file ? "#9ca3af" : "#2563eb",
              color: "#fff",
              fontWeight: 600,
              cursor: busy || !file ? "not-allowed" : "pointer",
            }}
          >
            {phase === "encrypting"
              ? "Encrypting…"
              : phase === "uploading"
                ? "Uploading…"
                : "Upload document"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={busy}
            style={{
              padding: "0.625rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#374151",
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Clear
          </button>
        </div>
      </form>

      {documentId && (
        <div data-testid="kyc-status" style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <p style={{ fontSize: "0.8125rem", margin: 0 }}>
            <strong>Verification status:</strong>{' '}
            <span style={{ color: statusColor(verification?.status ?? "pending"), fontWeight: 600 }}>
              {formatStatus(verification?.status ?? "pending")}
            </span>
            {isPolling && <span style={{ color: "#6b7280" }}> (polling…)</span>}
          </p>
          {verification?.reason && (
            <p style={{ fontSize: "0.75rem", color: "#dc2626", margin: 0 }}>
              {verification.reason}
            </p>
          )}
          {statusError && (
            <p role="alert" style={{ fontSize: "0.75rem", color: "#dc2626", margin: 0 }}>
              {statusError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
