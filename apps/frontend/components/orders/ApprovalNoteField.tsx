"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

export const APPROVAL_NOTE_MAX_LENGTH = 280;

export interface ApprovalNoteFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  /** "popover" for the compact row action, "textarea" for the drawer's full-width field. */
  variant?: "popover" | "textarea";
  autoFocus?: boolean;
}

/**
 * Optional note input for the approve action (#573) — max
 * `APPROVAL_NOTE_MAX_LENGTH` chars with a live counter. Shared between the
 * row-level popover (`ApprovalCard`) and the drawer's inline textarea
 * (`ApprovalDrawer`); the note is always rendered back as a plain text node
 * (never `dangerouslySetInnerHTML`) wherever it's displayed later, so no
 * sanitization is needed here beyond the length cap.
 */
export function ApprovalNoteField({
  id,
  value,
  onChange,
  onSubmit,
  onCancel,
  disabled = false,
  variant = "textarea",
  autoFocus = false,
}: ApprovalNoteFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const remaining = APPROVAL_NOTE_MAX_LENGTH - value.length;
  const overLimit = remaining < 0;

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel?.();
    }
    if (variant === "popover" && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
      onSubmit?.();
    }
  }

  return (
    <div className={`approval-note-field approval-note-field-${variant}`}>
      <label htmlFor={id} className={variant === "popover" ? "sr-only" : undefined}>
        Note (optional)
      </label>
      <textarea
        ref={textareaRef}
        id={id}
        className="approval-note-textarea"
        placeholder="Add a note for this approval (optional)"
        value={value}
        maxLength={APPROVAL_NOTE_MAX_LENGTH + 40}
        rows={variant === "popover" ? 2 : 3}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-describedby={`${id}-counter`}
      />
      <span
        id={`${id}-counter`}
        className={`approval-note-counter${overLimit ? " approval-note-counter-over" : ""}`}
        aria-live="polite"
      >
        {remaining} character{remaining === 1 ? "" : "s"} remaining
      </span>
    </div>
  );
}
