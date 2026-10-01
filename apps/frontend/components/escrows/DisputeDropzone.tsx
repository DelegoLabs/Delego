"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTO_FILES,
  validateIncomingPhotos,
} from "../../lib/disputeWizard";

export interface DisputeDropzoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  /** Step-level error from the wizard (e.g. too many photos). */
  error?: string;
  disabled?: boolean;
}

/**
 * Drag-and-drop (or click-to-browse) photo picker with thumbnail previews
 * for the dispute wizard (#783). Controlled: the wizard owns `files`.
 * Validation lives in `lib/disputeWizard`; EXIF scrubbing happens at submit.
 */
export function DisputeDropzone({ files, onChange, error, disabled = false }: DisputeDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files]
  );

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  const addFiles = (incoming: File[]) => {
    if (disabled || incoming.length === 0) return;
    const { accepted, errors } = validateIncomingPhotos(incoming, files.length);
    setMessages(errors);
    if (accepted.length > 0) onChange([...files, ...accepted]);
  };

  const removeFile = (index: number) => {
    setMessages([]);
    onChange(files.filter((_, i) => i !== index));
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) setDragging(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer?.files ?? []));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const allMessages = error ? [error, ...messages] : messages;

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Add evidence photos"
        data-testid="dispute-dropzone"
        data-dragging={dragging ? "true" : "false"}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          padding: "1.5rem",
          textAlign: "center",
          borderRadius: "0.5rem",
          border: `2px dashed ${dragging ? "#2563eb" : "var(--color-border)"}`,
          background: dragging ? "#eff6ff" : "var(--color-bg-surface)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <p style={{ margin: 0, fontWeight: 500 }}>Drag photos here, or click to browse</p>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
          JPG, PNG or WebP, up to {MAX_PHOTO_BYTES / (1024 * 1024)} MB each. Location and camera
          details are removed before sending.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        data-testid="dispute-dropzone-input"
        aria-label="Select evidence photos"
        onChange={handleInputChange}
        style={{ display: "none" }}
      />

      {allMessages.length > 0 && (
        <ul role="alert" className="settings-status error" style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
          {allMessages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {previews.length > 0 && (
        <>
          <p style={{ margin: "0.75rem 0 0.25rem", fontSize: "0.8125rem" }}>
            {files.length} of {MAX_PHOTO_FILES} photos
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            {previews.map((preview, index) => (
              <li key={preview.url} style={{ width: "5rem", textAlign: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.url}
                  alt={`Preview of ${preview.file.name}`}
                  width={80}
                  height={80}
                  style={{ width: "5rem", height: "5rem", objectFit: "cover", borderRadius: "0.375rem", border: "1px solid var(--color-border)" }}
                />
                <button
                  type="button"
                  aria-label={`Remove ${preview.file.name}`}
                  onClick={() => removeFile(index)}
                  style={{ marginTop: "0.25rem", fontSize: "0.75rem", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
