"use client";

import { useCallback, useRef, useState } from "react";
import type { DragEvent, ChangeEvent } from "react";
import type { Dispute } from "@delegolabs/types";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { disputeReasonLabel } from "../../lib/disputes";
import { submitDisputeResponse } from "../../lib/disputeResponses";
import { useDemoModeGuard } from "../../hooks/useDemoModeGuard";

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

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.webp,.pdf";

function isAcceptedFile(file: File): boolean {
  return ACCEPTED_MIME_TYPES.includes(file.type);
}

/**
 * Slide-out drawer letting a merchant review a buyer's dispute claim and
 * submit a written response plus optional counter-evidence files (receipts,
 * photos, proof of delivery) before arbitration begins.
 *
 * The dropzone accepts up to 5 files (JPEG / PNG / WebP / PDF, max 10 MB
 * each) via drag-and-drop or the native file picker.
 */
export function DisputeResponseDrawer({
  open,
  dispute,
  arbitrationDeadline,
  onClose,
  onSubmitted,
}: DisputeResponseDrawerProps) {
  // Traps the panel, not the overlay: the backdrop is a sibling of the panel
  // and must stay out of the tab cycle (#752).
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [merchantStatement, setMerchantStatement] = useState("");
  const [carrierTrackingUrl, setCarrierTrackingUrl] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pendingOverflow, setPendingOverflow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { disabledProps, guard } = useDemoModeGuard();

  useFocusTrap({ containerRef: panelRef, isActive: open, onEscape: onClose });

  const arbitrationExpired =
    new Date(arbitrationDeadline).getTime() <= Date.now();
  const canSubmit =
    merchantStatement.trim().length > 0 && !submitting && !arbitrationExpired;

  // ── File helpers ────────────────────────────────────────────────────────────

  const addFiles = useCallback((incoming: File[]) => {
    setFileError(null);
    setPendingOverflow(false);
    const tooBig = incoming.filter((f) => f.size > MAX_FILE_BYTES);
    const wrongType = incoming.filter((f) => !isAcceptedFile(f));

    if (tooBig.length > 0) {
      setFileError(
        `${tooBig.map((f) => f.name).join(", ")} — each file must be 10 MB or smaller.`
      );
      return;
    }
    if (wrongType.length > 0) {
      setFileError(
        `${wrongType.map((f) => f.name).join(", ")} — only JPEG, PNG, WebP, and PDF files are accepted.`
      );
      return;
    }

    setReceiptFiles((prev) => {
      const fresh = incoming.filter(
        (f) => !prev.some((p) => p.name === f.name && p.size === f.size),
      );
      if (prev.length + fresh.length > MAX_FILES) {
        // Signal the overflow as an error rather than adding a side effect
        // from inside this updater — React may run it more than once.
        setPendingOverflow(true);
        return prev;
      }
      return [...prev, ...fresh];
    });
  }, []);

  const removeFile = (index: number) => {
    setReceiptFiles((prev) => prev.filter((_, i) => i !== index));
    setFileError(null);
  };

  // ── Drag-and-drop handlers ──────────────────────────────────────────────────

  const displayFileError = fileError ??
    (pendingOverflow ? `You may attach up to ${MAX_FILES} files.` : null);


  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    addFiles(dropped);
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    addFiles(selected);
    // Reset the input so the same file can be re-added after removal.
    e.target.value = "";
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = guard(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitDisputeResponse({
        disputeId: dispute.id,
        merchantStatement,
        carrierTrackingUrl: carrierTrackingUrl || undefined,
        receiptFiles,
      });
      onSubmitted();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit response."
      );
    } finally {
      setSubmitting(false);
    }
  });

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      {/* The panel carries the dialog semantics; the wrapper and backdrop are
          presentational so screen readers announce one dialog, not two. */}
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }}
        data-testid="dispute-response-drawer-backdrop"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Respond to dispute"
        tabIndex={-1}
        data-testid="dispute-response-drawer"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          padding: "1.25rem",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <h3 style={{ margin: 0 }}>Respond to dispute</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1.125rem" }}
          >
            ✕
          </button>
        </div>

        {/* ── Buyer's claim summary ────────────────────────────────────────── */}
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
          data-testid="dispute-claim-summary"
        >
          <strong>Buyer&apos;s claim</strong>
          <span>Reason: {disputeReasonLabel(dispute.reason)}</span>
          {dispute.description && <span>{dispute.description}</span>}
        </div>

        {/* ── Arbitration deadline warning ─────────────────────────────────── */}
        {arbitrationExpired && (
          <p
            role="alert"
            style={{ fontSize: "0.8125rem", color: "#dc2626", margin: 0 }}
            data-testid="arbitration-expired-notice"
          >
            The arbitration period has begun — responses can no longer be submitted.
          </p>
        )}

        {/* ── Merchant statement ───────────────────────────────────────────── */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            Your response
            <span aria-label="required" style={{ color: "#dc2626", marginLeft: "0.25rem" }}>
              *
            </span>
          </span>
          <textarea
            aria-label="Your response"
            value={merchantStatement}
            onChange={(e) => setMerchantStatement(e.target.value)}
            disabled={arbitrationExpired}
            rows={4}
            placeholder="Describe your position and any relevant context…"
            style={{
              padding: "0.5rem 0.625rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              resize: "vertical",
            }}
          />
        </label>

        {/* ── Carrier tracking URL ─────────────────────────────────────────── */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            Carrier tracking URL (optional)
          </span>
          <input
            type="url"
            aria-label="Carrier tracking URL"
            value={carrierTrackingUrl}
            onChange={(e) => setCarrierTrackingUrl(e.target.value)}
            disabled={arbitrationExpired}
            placeholder="https://track.carrier.com/…"
            style={{
              padding: "0.5rem 0.625rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
            }}
          />
        </label>

        {/* ── Counter-evidence file dropzone ───────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            Counter-evidence files (optional — up to {MAX_FILES})
          </span>
          <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            JPEG, PNG, WebP, or PDF · max 10 MB each
          </span>

          {/* Hidden native input — triggered by the dropzone button */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleFileInputChange}
            disabled={arbitrationExpired || receiptFiles.length >= MAX_FILES}
            style={{ display: "none" }}
            aria-hidden="true"
            data-testid="receipt-file-input"
          />

          {/* Dropzone */}
          {!arbitrationExpired && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload counter-evidence files"
              aria-disabled={receiptFiles.length >= MAX_FILES}
              onClick={() => {
                if (receiptFiles.length < MAX_FILES) fileInputRef.current?.click();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (receiptFiles.length < MAX_FILES) fileInputRef.current?.click();
                }
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              data-testid="file-dropzone"
              style={{
                padding: "1.25rem",
                borderRadius: "0.5rem",
                border: `2px dashed ${dragOver ? "#2563eb" : "#d1d5db"}`,
                background: dragOver ? "#eff6ff" : "#f9fafb",
                textAlign: "center",
                cursor: receiptFiles.length >= MAX_FILES ? "not-allowed" : "pointer",
                fontSize: "0.8125rem",
                color: "#6b7280",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              {receiptFiles.length >= MAX_FILES
                ? `Maximum ${MAX_FILES} files attached`
                : "Drag & drop files here, or click to browse"}
            </div>
          )}

          {/* File list */}
          {receiptFiles.length > 0 && (
            <ul
              aria-label="Attached files"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.375rem",
              }}
            >
              {receiptFiles.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.375rem 0.625rem",
                    borderRadius: "0.375rem",
                    background: "#f3f4f6",
                    fontSize: "0.8125rem",
                  }}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "80%",
                    }}
                  >
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    aria-label={`Remove ${file.name}`}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "#6b7280",
                      padding: "0 0.25rem",
                      flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {displayFileError && (
            <p
              role="alert"
              style={{ fontSize: "0.75rem", color: "#dc2626", margin: 0 }}
              data-testid="file-error"
            >
              {displayFileError}
            </p>
          )}
        </div>

        {/* ── Submit error ─────────────────────────────────────────────────── */}
        {error && (
          <p
            role="alert"
            style={{ fontSize: "0.75rem", color: "#dc2626", margin: 0 }}
            data-testid="submit-error"
          >
            {error}
          </p>
        )}

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "auto" }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            {...disabledProps}
            style={{
              flex: 1,
              padding: "0.625rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: canSubmit ? "#2563eb" : "#9ca3af",
              color: "#fff",
              fontWeight: 600,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
            data-testid="submit-button"
          >
            {submitting ? "Submitting…" : "Submit response"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "0.625rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: "pointer",
            }}
            data-testid="cancel-button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
