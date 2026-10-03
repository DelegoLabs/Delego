"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@delegolabs/ui";
import type { CreateDisputeInput, DisputeReason } from "@delegolabs/types";
import { DISPUTE_REASON_OPTIONS, MAX_EVIDENCE_URLS } from "../../lib/disputes";
import { blobToDataUrl, scrubExifMetadata } from "../../lib/exif";
import { useDemoModeGuard } from "../../hooks/useDemoModeGuard";
import { useDisputeDraft } from "../../hooks/useDisputeDraft";

export interface DisputeModalProps {
  isOpen: boolean;
  submitting?: boolean;
  error?: string | null;
  /**
   * Escrow the dispute belongs to. When provided, the in-progress draft is
   * persisted to sessionStorage under this id so a refresh restores it (#746).
   * Omit it to keep the form purely in-memory (fully backwards compatible).
   */
  escrowId?: string;
  onSubmit: (input: CreateDisputeInput) => void | Promise<unknown>;
  onClose: () => void;
}

interface EvidencePhoto {
  id: string;
  name: string;
  /** Data URL of the re-encoded image — EXIF/GPS/serial tags already dropped. */
  dataUrl: string;
}

/**
 * "Open dispute" modal — reason select, description, optional evidence URLs,
 * and optional photo evidence.
 *
 * Photos are scrubbed of EXIF metadata in the browser via `lib/exif` (#789).
 * The typed draft is persisted per escrow (see hooks/useDisputeDraft.ts) and
 * restored on mount (#746).
 */
export function DisputeModal({
  isOpen,
  submitting = false,
  error,
  escrowId,
  onSubmit,
  onClose,
}: DisputeModalProps) {
  const { draft, updateDraft, clearDraft } = useDisputeDraft(escrowId);
  const { reason, description, evidenceUrls } = draft;
  const [photos, setPhotos] = useState<EvidencePhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const photoCounter = useRef(0);
  const { disabledProps, guard } = useDemoModeGuard();

  if (!isOpen) return null;

  const setReason = (next: DisputeReason) =>
    updateDraft({ ...draft, reason: next });

  const setDescription = (next: string) =>
    updateDraft({ ...draft, description: next });

  const filledUrlCount = evidenceUrls.filter((url) => url.trim().length > 0).length;
  const evidenceCount = filledUrlCount + photos.length;
  const atEvidenceLimit = evidenceCount >= MAX_EVIDENCE_URLS;

  const updateEvidenceUrl = (index: number, value: string) => {
    updateDraft({
      ...draft,
      evidenceUrls: evidenceUrls.map((url, i) => (i === index ? value : url)),
    });
  };

  const addEvidenceUrl = () => {
    updateDraft({
      ...draft,
      evidenceUrls:
        evidenceUrls.length >= MAX_EVIDENCE_URLS
          ? evidenceUrls
          : [...evidenceUrls, ""],
    });
  };

  const removeEvidenceUrl = (index: number) => {
    updateDraft({
      ...draft,
      evidenceUrls: evidenceUrls.filter((_, i) => i !== index),
    });
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((photo) => photo.id !== id));
  };

  const handlePhotoSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    // Reset so re-picking the same file still fires a change event.
    event.target.value = "";
    if (selected.length === 0) return;

    const slots = MAX_EVIDENCE_URLS - evidenceCount;
    if (slots <= 0) {
      setPhotoError(`You can attach up to ${MAX_EVIDENCE_URLS} pieces of evidence.`);
      return;
    }

    const accepted = selected.slice(0, slots);
    const dropped = selected.length - accepted.length;

    setScrubbing(true);
    setPhotoError(null);
    try {
      const scrubbed: EvidencePhoto[] = [];
      for (const file of accepted) {
        const blob = await scrubExifMetadata(file);
        photoCounter.current += 1;
        scrubbed.push({
          id: `dispute-photo-${photoCounter.current}`,
          name: file.name,
          dataUrl: await blobToDataUrl(blob),
        });
      }
      setPhotos((prev) => [...prev, ...scrubbed]);
      if (dropped > 0) {
        setPhotoError(
          `Only added ${scrubbed.length} photo${scrubbed.length === 1 ? "" : "s"} — up to ${MAX_EVIDENCE_URLS} pieces of evidence are allowed.`
        );
      }
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : "Could not process that photo. Try another image."
      );
    } finally {
      setScrubbing(false);
    }
  };

  const canSubmit = description.trim().length > 0 && !submitting && !scrubbing;

  const handleSubmit = guard(async () => {
    if (!canSubmit) return;
    const result = await onSubmit({
      reason,
      description: description.trim(),
      evidenceUrls: [
        ...evidenceUrls.map((url) => url.trim()).filter(Boolean),
        ...photos.map((photo) => photo.dataUrl),
      ],
    });
    if (result) clearDraft();
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

        <div className="dispute-modal-field">
          <span className="dispute-modal-label">Evidence photos (optional)</span>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
            Location and camera details are removed in your browser before the photos are
            attached.
          </p>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 0.75rem",
              borderRadius: "0.375rem",
              border: "1px dashed var(--color-border)",
              background: "var(--color-bg-surface)",
              color: "var(--color-text-primary)",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: scrubbing || atEvidenceLimit ? "not-allowed" : "pointer",
              opacity: atEvidenceLimit ? 0.6 : 1,
            }}
          >
            <span>{scrubbing ? "Removing metadata…" : "Attach photos"}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              data-testid="dispute-photo-input"
              aria-label="Attach evidence photos"
              onChange={handlePhotoSelect}
              disabled={scrubbing || atEvidenceLimit}
            />
          </label>

          {photoError && (
            <p className="settings-status error" role="alert">
              {photoError}
            </p>
          )}

          {photos.length > 0 && (
            <ul
              style={{
                listStyle: "none",
                margin: "0.75rem 0 0",
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {photos.map((photo) => (
                <li
                  key={photo.id}
                  style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.dataUrl}
                    alt={`Scrubbed evidence: ${photo.name}`}
                    width={48}
                    height={48}
                    style={{
                      width: "3rem",
                      height: "3rem",
                      objectFit: "cover",
                      borderRadius: "0.375rem",
                      border: "1px solid var(--color-border)",
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: "0.8125rem",
                    }}
                  >
                    {photo.name}
                  </span>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.02em",
                      color: "var(--color-success-text)",
                    }}
                  >
                    Metadata removed
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => removePhoto(photo.id)}
                    ariaLabel={`Remove photo ${photo.name}`}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
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
