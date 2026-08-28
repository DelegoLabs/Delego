"use client";

import { useEffect, useRef } from "react";
import { Button, Card } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";

export interface IdleSessionModalProps {
  open: boolean;
  /** Whole seconds left before the session lapses and the app redirects. */
  secondsLeft: number;
  /** User confirmed they're still here — triggers the keep-alive ping. */
  onStay: () => void;
}

/**
 * "Still there?" prompt shown after a stretch of inactivity (#514). Confirming
 * pings a cheap endpoint to slide the session forward; ignoring it until the
 * countdown reaches zero redirects to /login (with any form draft preserved
 * for restore on return). There is no "log out now" action — the countdown
 * is the decline path, so the modal has a single primary action.
 */
export function IdleSessionModal({
  open,
  secondsLeft,
  onStay,
}: IdleSessionModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      // A keypress is itself a sign of life — treat Esc as "I'm still here".
      if (e.key === "Escape") onStay();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onStay]);

  if (!open) return null;

  const countdownLabel =
    secondsLeft === 1 ? "1 second" : `${secondsLeft} seconds`;

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: "1rem",
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-session-title"
        aria-describedby="idle-session-body"
        tabIndex={-1}
        style={{ maxWidth: "420px", width: "100%" }}
      >
        <Card title="Still there?" ariaLabel="Session about to expire">
          <p
            id="idle-session-body"
            style={{
              margin: "0.75rem 0 1.25rem",
              fontSize: "0.9375rem",
              color: "var(--color-text-main, #374151)",
            }}
          >
            You&rsquo;ve been inactive for a while. To keep your session and
            anything you&rsquo;re part-way through, confirm you&rsquo;re still
            here. Otherwise you&rsquo;ll be signed out in{" "}
            <strong aria-live="polite">{countdownLabel}</strong> and returned to
            this page after signing back in.
          </p>
          <span id="idle-session-title" hidden>
            Session about to expire
          </span>
          <div
            className="form-actions"
            style={{ display: "flex", justifyContent: "flex-end" }}
          >
            <Button variant="primary" onClick={onStay}>
              I&rsquo;m still here
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
