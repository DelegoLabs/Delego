"use client";

import React, { useState } from "react";

export interface ReAuthPromptProps {
  /** Clear human-readable description of the sensitive action requiring elevated privilege. */
  actionDescription: string;
  /** Callback invoked when biometric authentication succeeds. */
  onSuccess: () => void;
  /** Callback invoked when the user cancels or dismisses the modal. */
  onCancel: () => void;
}

export const ELEVATED_SESSION_STORAGE_KEY = "delego_elevated_session_until";
export const DEFAULT_ELEVATION_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Checks whether the current browser session has an active elevated privilege.
 */
export function isSessionElevated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(ELEVATED_SESSION_STORAGE_KEY);
    if (!raw) return false;
    const expiresAt = Number(raw);
    return !Number.isNaN(expiresAt) && Date.now() < expiresAt;
  } catch {
    return false;
  }
}

/**
 * Grants elevated session privilege for a given duration (defaults to 5 minutes).
 */
export function setElevatedSession(
  durationMs: number = DEFAULT_ELEVATION_DURATION_MS
): void {
  if (typeof window === "undefined") return;
  try {
    const expiresAt = Date.now() + durationMs;
    window.sessionStorage.setItem(
      ELEVATED_SESSION_STORAGE_KEY,
      expiresAt.toString()
    );
  } catch {
    // Best-effort in environments where sessionStorage is disabled.
  }
}

/**
 * Revokes any currently active elevated session privilege.
 */
export function clearElevatedSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ELEVATED_SESSION_STORAGE_KEY);
  } catch {
    // Best-effort
  }
}

/**
 * Modal dialog that prompts the user for WebAuthn biometric passkey
 * re-authentication before sensitive account actions (#1025).
 */
export function BiometricReAuthModal({
  actionDescription,
  onSuccess,
  onCancel,
}: ReAuthPromptProps) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAuthenticate = async () => {
    setIsAuthenticating(true);
    setErrorMessage(null);

    try {
      if (
        typeof window === "undefined" ||
        !window.navigator ||
        !window.navigator.credentials ||
        typeof window.navigator.credentials.get !== "function"
      ) {
        throw new Error(
          "Biometric passkeys and WebAuthn are not supported by this browser."
        );
      }

      // Generate a cryptographic challenge for the re-auth assertion
      const challenge = new Uint8Array(32);
      if (typeof window.crypto !== "undefined" && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(challenge);
      }

      const assertion = await window.navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname || "localhost",
          userVerification: "required",
          timeout: 60000,
        },
      });

      if (!assertion) {
        throw new Error("Biometric authentication was cancelled or returned no credentials.");
      }

      // Grant temporary 5-minute elevated session privilege upon successful biometric touch
      setElevatedSession();
      onSuccess();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Biometric authentication failed. Please try again.";
      setErrorMessage(message);
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-modal-title"
      aria-describedby="reauth-modal-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-xl">
            🔒
          </div>
          <div>
            <h2
              id="reauth-modal-title"
              className="text-lg font-semibold text-foreground"
            >
              Security Re-Authentication
            </h2>
            <p className="text-xs text-muted-foreground">
              Biometric touch or passkey confirmation required
            </p>
          </div>
        </div>

        <p id="reauth-modal-description" className="text-sm text-foreground/80">
          To <span className="font-semibold text-foreground">{actionDescription}</span>,
          please verify your identity using your biometric passkey. Elevated privileges
          will remain active for 5 minutes.
        </p>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive font-medium"
          >
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isAuthenticating}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAuthenticate}
            disabled={isAuthenticating}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            {isAuthenticating ? "Verifying..." : "Verify with Passkey"}
          </button>
        </div>
      </div>
    </div>
  );
}
