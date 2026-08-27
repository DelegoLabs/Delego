"use client";

import { useState } from "react";
import { Button } from "@delegolabs/ui";
import type { CreateDisputeInput, DisputeReason } from "@delegolabs/types";
import { DISPUTE_REASON_OPTIONS, MAX_EVIDENCE_URLS } from "../../lib/disputes";
import { useDemoModeGuard } from "../../hooks/useDemoModeGuard";

export interface DisputeModalProps {
  isOpen: boolean;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (input: CreateDisputeInput) => void | Promise<unknown>;
  onClose: () => void;
}

/**
 * "Open dispute" modal — reason select, description, and optional evidence
 * URLs. Submission itself (and the resulting optimistic UI) is owned by the
 * caller via `onSubmit` (see hooks/useDispute.ts).
 */
export function DisputeModal({
  isOpen,
  submitting = false,
  error,
  onSubmit,
  onClose,
}: DisputeModalProps) {
  const [reason, setReason] = useState<DisputeReason>("item_not_received");
  const [description, setDescription] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([""]);
  const { disabledProps, guard } = useDemoModeGuard();

  if (!isOpen) return null;

  const updateEvidenceUrl = (index: number, value: string) => {
    setEvidenceUrls((prev) => prev.map((url, i) => (i === index ? value : url)));
  };

  const addEvidenceUrl = () => {
    setEvidenceUrls((prev) => (prev.length >= MAX_EVIDENCE_URLS ? prev : [...prev, ""]));
  };

  const removeEvidenceUrl = (index: number) => {
    setEvidenceUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const canSubmit = description.trim().length > 0 && !submitting;

  const handleSubmit = guard(() => {
    if (!canSubmit) return;
    onSubmit({
      reason,
      description: description.trim(),
      evidenceUrls: evidenceUrls.map((url) => url.trim()).filter(Boolean),
    });
  });

  return (
    <div className="dispute-modal-overlay" onClick={onClose} data-testid="dispute-modal-backdrop">
      <div
        className="dispute-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispute-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dispute-modal-header">
          <h2 id="dispute-modal-title">Open dispute</h2>
          <button type="button" aria-label="Close" className="approval-drawer-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="dispute-modal-field">
          <label htmlFor="dispute-reason">Reason</label>
          <select
            id="dispute-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as DisputeReason)}
          >
            {DISPUTE_REASON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="dispute-modal-field">
          <label htmlFor="dispute-description">
            Description
            <span aria-label="required" className="dispute-modal-required">
              *
            </span>
          </label>
          <textarea
            id="dispute-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            required
            placeholder="Describe what happened"
          />
        </div>

        <div className="dispute-modal-field">
          <span className="dispute-modal-label">Evidence URLs (optional)</span>
          {evidenceUrls.map((url, index) => (
            <div className="dispute-modal-evidence-row" key={index}>
              <input
                type="url"
                value={url}
                onChange={(e) => updateEvidenceUrl(index, e.target.value)}
                placeholder="https://..."
                aria-label={`Evidence URL ${index + 1}`}
              />
              {evidenceUrls.length > 1 && (
                <Button
                  variant="ghost"
                  onClick={() => removeEvidenceUrl(index)}
                  ariaLabel={`Remove evidence URL ${index + 1}`}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          {evidenceUrls.length < MAX_EVIDENCE_URLS && (
            <Button variant="ghost" onClick={addEvidenceUrl}>
              + Add another URL
            </Button>
          )}
        </div>

        {error && (
          <div className="settings-status error" role="alert">
            {error}
          </div>
        )}

        <div className="form-actions">
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            {...disabledProps}
          >
            {submitting ? "Submitting…" : "Submit dispute"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
