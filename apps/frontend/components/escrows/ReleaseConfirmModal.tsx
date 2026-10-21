"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@delegolabs/ui";
import type { Escrow } from "@delegolabs/types";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  MAX_SATISFACTION_NOTE_LENGTH,
  buildReleaseConfirmPayload,
  type ReleaseConfirmPayload,
} from "../../lib/releaseConfirmation";
import { ConfettiBurst } from "./ConfettiBurst";
import { StarRating } from "./StarRating";
import { inspectTapTarget } from "../../lib/tapjacking";

export interface ReleaseConfirmModalProps {
  isOpen: boolean;
  escrow: Escrow;
  onClose: () => void;
  /**
   * Performs the actual release (on-chain contract call + API). Rejecting
   * keeps the modal open and surfaces the message to the buyer so a failed
   * payout is never mistaken for a successful one.
   */
  onConfirm: (payload: ReleaseConfirmPayload) => void | Promise<unknown>;
  /** Caller-owned in-flight flag; combined with the modal's own submit state. */
  submitting?: boolean;
  /** Caller-owned error message (e.g. from a shared release hook). */
  error?: string | null;
}

/**
 * Confirmation step for the buyer's "1-click delivery confirmation" (#707):
 * optional 5-star merchant rating, optional note, and a single action that
 * releases the Soroban escrow. Submission itself is owned by the caller via
 * `onConfirm`, which mirrors how `DisputeModal` and `ExtensionModal` split
 * presentation from side effects.
 *
 * On a resolved `onConfirm` the modal switches to its terminal "Released"
 * state and plays a decorative `<ConfettiBurst>` (skipped under reduced
 * motion). A rejected `onConfirm` leaves the form intact so the buyer can
 * retry.
 */
export function ReleaseConfirmModal({
  isOpen,
  escrow,
  onClose,
  onConfirm,
  submitting = false,
  error,
}: ReleaseConfirmModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [released, setReleased] = useState(false);
  const blockedTouchRef = useRef(false);

  useFocusTrap({ containerRef: dialogRef, isActive: isOpen });

  useEffect(() => {
    if (!isOpen) return;

    const reportObscuredButton = (button: HTMLButtonElement, x: number, y: number) => {
      if (typeof document.elementFromPoint !== "function") return false;
      const inspection = inspectTapTarget(button, x, y);
      if (!inspection.isObscured) return false;

      blockedTouchRef.current = true;
      setFailure(
        "Release blocked because an unexpected overlay covers this button. Close suspicious overlay apps and try again."
      );
      return true;
    };

    const inspectButtonBounds = () => {
      const protectedButtons = document.querySelectorAll<HTMLButtonElement>(
        "button[data-tapjacking-protected]"
      );
      for (const button of protectedButtons) {
        const bounds = button.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) continue;
        const insetX = Math.min(2, bounds.width / 4);
        const insetY = Math.min(2, bounds.height / 4);
        const points = [
          [bounds.left + bounds.width / 2, bounds.top + bounds.height / 2],
          [bounds.left + insetX, bounds.top + insetY],
          [bounds.right - insetX, bounds.top + insetY],
          [bounds.left + insetX, bounds.bottom - insetY],
          [bounds.right - insetX, bounds.bottom - insetY],
        ];
        if (points.some(([x, y]) => reportObscuredButton(button, x, y))) return;
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      const protectedButtons = document.querySelectorAll<HTMLButtonElement>(
        "button[data-tapjacking-protected]"
      );
      for (const touch of Array.from(event.changedTouches)) {
        const button = Array.from(protectedButtons).find((candidate) => {
          const bounds = candidate.getBoundingClientRect();
          return (
            !candidate.disabled &&
            touch.clientX >= bounds.left &&
            touch.clientX <= bounds.right &&
            touch.clientY >= bounds.top &&
            touch.clientY <= bounds.bottom
          );
        });
        if (!button) continue;

        if (reportObscuredButton(button, touch.clientX, touch.clientY)) return;
      }
    };

    inspectButtonBounds();
    document.addEventListener("touchend", onTouchEnd, true);
    return () => document.removeEventListener("touchend", onTouchEnd, true);
  }, [isOpen]);

  const isSubmitting = submitting || busy;
  const message = failure ?? error ?? null;

  const handleConfirm = useCallback(async () => {
    if (blockedTouchRef.current) {
      blockedTouchRef.current = false;
      return;
    }
    if (released || isSubmitting) return;

    setBusy(true);
    setFailure(null);

    try {
      await onConfirm(buildReleaseConfirmPayload(escrow, { rating, note }));
      setReleased(true);
    } catch (err) {
      setFailure(
        err instanceof Error ? err.message : "Release failed. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }, [released, isSubmitting, onConfirm, escrow, rating, note]);

  if (!isOpen) return null;

  return (
    <div
      className="approval-drawer-overlay"
      onClick={released ? onClose : undefined}
      data-testid="release-confirm-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-confirm-title"
        data-testid="release-confirm-modal"
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "relative",
          width: "calc(100% - 2rem)",
          maxWidth: "28rem",
          margin: "10vh auto",
          padding: "1.25rem",
          background: "var(--color-bg-surface, #fff)",
          borderRadius: "0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
        }}
      >
        {released ? (
          <>
            <ConfettiBurst />
            <span
              data-testid="release-status-badge"
              style={{
                alignSelf: "flex-start",
                padding: "0.2rem 0.625rem",
                borderRadius: "9999px",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#166534",
                backgroundColor: "#dcfce7",
              }}
            >
              Released
            </span>
            <h2 id="release-confirm-title" style={{ margin: 0 }}>
              Funds released
            </h2>
            <p style={{ margin: 0, color: "var(--color-text-muted, #6b7280)" }}>
              The merchant has been paid and this escrow is now closed.
              {rating !== null ? ` Thanks for rating this order ${rating}/5.` : ""}
            </p>
            <div className="form-actions">
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 id="release-confirm-title" style={{ margin: 0 }}>
              Confirm delivery &amp; release
            </h2>
            <p style={{ margin: 0, color: "var(--color-text-muted, #6b7280)" }}>
              Confirming releases the escrowed funds to the merchant immediately.
              This can&apos;t be undone.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span id="release-rating-label" style={{ fontWeight: 500, fontSize: "0.875rem" }}>
                Rate the merchant (optional)
              </span>
              <StarRating
                value={rating}
                onChange={setRating}
                disabled={isSubmitting}
                label="Merchant rating"
                describedBy="release-rating-hint"
              />
              <span
                id="release-rating-hint"
                style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #6b7280)" }}
              >
                {rating === null
                  ? "Tap a star to rate your experience."
                  : `${rating} of 5 stars selected.`}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label htmlFor="release-satisfaction-note" style={{ fontWeight: 500, fontSize: "0.875rem" }}>
                Satisfaction note (optional)
              </label>
              <textarea
                id="release-satisfaction-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                maxLength={MAX_SATISFACTION_NOTE_LENGTH}
                disabled={isSubmitting}
                placeholder="Anything the merchant should know"
              />
            </div>

            {message && (
              <p role="alert" style={{ margin: 0, fontSize: "0.8125rem", color: "#991b1b" }}>
                {message}
              </p>
            )}

            <div className="form-actions">
              <Button
                variant="primary"
                onClick={() => void handleConfirm()}
                onPointerDown={() => {
                  blockedTouchRef.current = false;
                }}
                disabled={isSubmitting}
                loading={isSubmitting}
                data-tapjacking-protected
              >
                {isSubmitting ? "Releasing…" : "Confirm & release"}
              </Button>
              <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
