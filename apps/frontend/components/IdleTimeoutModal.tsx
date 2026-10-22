"use client";

/**
 * Strict inactivity auto-logout UI (#1021).
 *
 * `IdleTimeoutModal` is the 60-second "You're about to be signed out"
 * countdown. `IdleTimeoutGuard` wires it to `useIdleTimer` and, when the
 * countdown lapses, purges every piece of sensitive state (signing keys,
 * session grant, cached reads, wallet connection) before sending the user to
 * the login view.
 */

import { useCallback, useEffect, useRef } from "react";
import { Button, Card } from "@delegolabs/ui";
import { useFocusTrap } from "../hooks/useFocusTrap";
import {
  DEFAULT_IDLE_TIMEOUTS,
  useIdleTimer,
  type IdleTimerConfig,
} from "../hooks/useIdleTimer";
import { syncWalletDisconnected } from "../hooks/useWallet";
import { loginRedirectUrl } from "../lib/session";
import { purgeSensitiveSessionState } from "../lib/sessionPurge";

export interface IdleTimeoutModalProps {
  open: boolean;
  /** Whole seconds until automatic sign-out. */
  secondsRemaining: number;
  /** "Stay signed in" — restarts the idle clock. */
  onStay: () => void;
  /** "Sign out now" — skips the rest of the countdown. */
  onLogoutNow: () => void;
}

export function IdleTimeoutModal({
  open,
  secondsRemaining,
  onStay,
  onLogoutNow,
}: IdleTimeoutModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ containerRef: panelRef, isActive: open });

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onStay();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onStay]);

  if (!open) return null;

  const countdownLabel =
    secondsRemaining === 1 ? "1 second" : `${secondsRemaining} seconds`;

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
        aria-labelledby="idle-timeout-title"
        aria-describedby="idle-timeout-body"
        tabIndex={-1}
        style={{ maxWidth: "420px", width: "100%" }}
      >
        <Card title="Are you still there?" ariaLabel="Automatic sign-out">
          <span id="idle-timeout-title" hidden>
            Automatic sign-out
          </span>
          <p
            id="idle-timeout-body"
            style={{
              margin: "0.75rem 0 1.25rem",
              fontSize: "0.9375rem",
              color: "var(--color-text-main, #374151)",
            }}
          >
            For your security you&rsquo;ll be signed out in{" "}
            <strong aria-live="polite">{countdownLabel}</strong>. Session keys
            and cached wallet data on this device will be cleared.
          </p>
          <div
            className="form-actions"
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.5rem",
            }}
          >
            <Button variant="secondary" onClick={onLogoutNow}>
              Sign out now
            </Button>
            <Button variant="primary" onClick={onStay}>
              Stay signed in
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export interface IdleTimeoutGuardProps
  extends Partial<Omit<IdleTimerConfig, "onLogout">> {
  enabled?: boolean;
  /** Overrides the post-purge navigation (tests). */
  redirect?: (url: string) => void;
}

function defaultRedirect(url: string): void {
  window.location.replace(url);
}

/** Mount once in the authenticated app shell. */
export function IdleTimeoutGuard({
  warningTimeoutMinutes = DEFAULT_IDLE_TIMEOUTS.warningTimeoutMinutes,
  logoutTimeoutMinutes = DEFAULT_IDLE_TIMEOUTS.logoutTimeoutMinutes,
  onWarning,
  enabled = true,
  redirect = defaultRedirect,
}: IdleTimeoutGuardProps) {
  const logout = useCallback(async () => {
    syncWalletDisconnected();
    await purgeSensitiveSessionState();
    redirect(loginRedirectUrl(window.location.href));
  }, [redirect]);

  const { isWarning, secondsRemaining, resetTimer } = useIdleTimer({
    warningTimeoutMinutes,
    logoutTimeoutMinutes,
    onWarning: onWarning ?? (() => {}),
    onLogout: () => void logout(),
    enabled,
  });

  return (
    <IdleTimeoutModal
      open={isWarning}
      secondsRemaining={secondsRemaining}
      onStay={resetTimer}
      onLogoutNow={() => void logout()}
    />
  );
}

export default IdleTimeoutModal;
