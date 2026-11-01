"use client";

import { useEffect, useState, useRef } from "react";

export interface ReAuthPromptProps {
  actionDescription: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const ELEVATED_PRIVILEGE_KEY = "delego_elevated_privilege_expires_at";
export const ELEVATED_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Checks whether the current session has an active elevated privilege window (#1025).
 */
export function hasElevatedPrivilege(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(ELEVATED_PRIVILEGE_KEY);
    if (!raw) return false;
    const expiresAt = parseInt(raw, 10);
    return !Number.isNaN(expiresAt) && Date.now() < expiresAt;
  } catch {
    return false;
  }
}

/**
 * Grants temporary elevated privilege for sensitive operations (default 5 minutes).
 */
export function grantElevatedPrivilege(durationMs: number = ELEVATED_DURATION_MS): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      ELEVATED_PRIVILEGE_KEY,
      (Date.now() + durationMs).toString()
    );
  } catch {
    // Ignore storage quota or security errors
  }
}

/**
 * Clears the elevated session privilege.
 */
export function revokeElevatedPrivilege(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ELEVATED_PRIVILEGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Biometric passkey re-authentication prompt modal (#1025).
 * Required before executing sensitive operations (revealing private recovery phrases,
 * updating payout addresses, rotating API keys).
 */
export function BiometricReAuthModal({
  actionDescription,
  onSuccess,
  onCancel,
}: ReAuthPromptProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check if user already holds valid elevated privilege
    if (hasElevatedPrivilege()) {
      onSuccess();
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSuccess, onCancel]);

  const handleAuthenticate = async () => {
    setLoading(true);
    setError(null);

    try {
      if (
        typeof window === "undefined" ||
        !window.navigator?.credentials ||
        typeof window.navigator.credentials.get !== "function"
      ) {
        throw new Error("WebAuthn biometric authentication is not supported on this device/browser.");
      }

      // Generate a client challenge buffer for user verification
      const challenge = new Uint8Array(32);
      if (window.crypto?.getRandomValues) {
        window.crypto.getRandomValues(challenge);
      }

      const credential = await window.navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: "required",
        },
      });

      if (!credential) {
        throw new Error("Biometric verification cancelled or timed out.");
      }

      // Elevate session privilege for 5 minutes
      grantElevatedPrivilege();
      onSuccess();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Biometric authentication failed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="biometric-reauth-title"
      aria-describedby="biometric-reauth-description"
      ref={modalRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "0.75rem",
          maxWidth: "460px",
          width: "100%",
          padding: "1.5rem",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          color: "#111827",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "#dbeafe",
              color: "#2563eb",
              marginBottom: "0.75rem",
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2
            id="biometric-reauth-title"
            style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.5rem 0" }}
          >
            Security Verification Required
          </h2>
          <p
            id="biometric-reauth-description"
            style={{ fontSize: "0.875rem", color: "#4b5563", margin: 0 }}
          >
            Please authenticate with your biometric passkey to{" "}
            <strong>{actionDescription}</strong>.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              padding: "0.75rem",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <button
            type="button"
            onClick={handleAuthenticate}
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              backgroundColor: loading ? "#93c5fd" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "0.5rem",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background-color 0.2s",
            }}
          >
            {loading ? "Authenticating..." : "Verify Biometric Passkey"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.625rem 1rem",
              backgroundColor: "transparent",
              color: "#4b5563",
              border: "1px solid #d1d5db",
              borderRadius: "0.5rem",
              fontWeight: 500,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
