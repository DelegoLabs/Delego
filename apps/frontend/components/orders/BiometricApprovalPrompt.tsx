"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@delegolabs/ui";
import {
  MAX_BIOMETRIC_ATTEMPTS,
  biometricErrorMessage,
  hasPlatformAuthenticator,
  isBiometricSupported,
  pinFallbackMessage,
  remainingAttempts,
  requestBiometricAssertion,
  shouldFallBackToPin,
} from "../../lib/biometricApproval";

export interface BiometricPromptProps {
  orderId: string;
  /** Human-facing amount, e.g. "1,500.00 XLM". */
  amount: string;
  onSuccess: (signature: string) => void;
  onError: (error: string) => void;
  /**
   * Optional host hook invoked when the user picks "Approve with wallet PIN",
   * so the caller can focus or scroll to its own PIN approval control.
   */
  onPinFallback?: () => void;
}

type Phase = "idle" | "scanning" | "fallback";

/**
 * Fingerprint / Face ID quick-approval for high-value orders (#724).
 *
 * Wraps `navigator.credentials.get()`. After `MAX_BIOMETRIC_ATTEMPTS` failed
 * assertions it stops offering biometrics and surfaces a "use your wallet PIN"
 * affordance — `onError` fires with the same guidance so the caller can
 * switch approval methods.
 */
export function BiometricApprovalPrompt({
  orderId,
  amount,
  onSuccess,
  onError,
  onPinFallback,
}: BiometricPromptProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [platformAuthenticator, setPlatformAuthenticator] = useState(false);
  const mountedRef = useRef(true);
  // Mirrors `attempts` so the scan handler always reads the live count without
  // having to be re-created on every attempt.
  const attemptsRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    hasPlatformAuthenticator().then((available) => {
      if (!cancelled) setPlatformAuthenticator(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const beginScan = useCallback(async () => {
    setPhase("scanning");
    setError(null);
    try {
      const signature = await requestBiometricAssertion({ orderId, amount });
      if (!mountedRef.current) return;
      setPhase("idle");
      attemptsRef.current = 0;
      setAttempts(0);
      onSuccess(signature);
    } catch (err) {
      if (!mountedRef.current) return;
      const message = biometricErrorMessage(err);
      const nextAttempts = attemptsRef.current + 1;
      attemptsRef.current = nextAttempts;
      setAttempts(nextAttempts);
      setError(message);
      if (shouldFallBackToPin(nextAttempts)) {
        setPhase("fallback");
        onError(pinFallbackMessage(amount));
      } else {
        setPhase("idle");
      }
    }
  }, [amount, onError, onSuccess, orderId]);

  const left = remainingAttempts(attempts);

  if (!isBiometricSupported()) {
    return (
      <div className="biometric-prompt" data-testid="biometric-prompt">
        <p data-testid="biometric-unsupported" style={{ margin: 0 }}>
          This device does not support biometric verification. Approve with
          your wallet PIN instead.
        </p>
      </div>
    );
  }

  if (phase === "fallback") {
    return (
      <div className="biometric-prompt" data-testid="biometric-prompt">
        <div role="alert" data-testid="biometric-fallback" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <p style={{ margin: 0 }}>{pinFallbackMessage(amount)}</p>
          <Button
            variant="secondary"
            type="button"
            data-testid="biometric-pin-fallback"
            onClick={() => onPinFallback?.()}
          >
            Approve with wallet PIN
          </Button>
        </div>
      </div>
    );
  }

  const scanning = phase === "scanning";

  return (
    <div className="biometric-prompt" data-testid="biometric-prompt">
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span
          data-testid="biometric-glyph"
          data-scanning={scanning}
          aria-hidden="true"
          className={scanning ? "biometric-glyph is-scanning" : "biometric-glyph"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "2.25rem",
            height: "2.25rem",
            borderRadius: "50%",
            color: scanning ? "#16a34a" : "#6b7280",
            animation: scanning
              ? "biometric-pulse 1.4s ease-in-out infinite"
              : undefined,
          }}
        >
          {platformAuthenticator ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 11a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
              <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
              <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
              <path d="M2 12a10 10 0 0 1 18-6" />
              <path d="M2 16h.01" />
              <path d="M21.8 16c.2-2 .131-5.354 0-6" />
              <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
              <path d="M8.65 22c.21-.66.45-1.32.57-2" />
              <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M8 10v4M12 9v6M16 11v2" />
            </svg>
          )}
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
            {scanning ? "Verifying…" : "Quick approve"}
          </span>
          <span className="stat-label" style={{ margin: 0 }}>
            {scanning
              ? `Confirm with fingerprint or Face ID for ${amount}`
              : `Approve ${amount} with fingerprint or Face ID`}
          </span>
        </div>
      </div>

      {error && !scanning && (
        <p
          role="alert"
          data-testid="biometric-error"
          style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", color: "var(--color-danger, #dc2626)" }}
        >
          {error}
          {` ${left} attempt${left === 1 ? "" : "s"} left before falling back to your wallet PIN.`}
        </p>
      )}

      <div style={{ marginTop: "0.75rem" }}>
        <Button
          variant="primary"
          type="button"
          onClick={beginScan}
          disabled={scanning}
          data-testid="biometric-start"
        >
          {scanning ? "Verifying…" : "Use biometrics"}
        </Button>
      </div>

      <p
        className="stat-label"
        style={{ margin: "0.5rem 0 0" }}
        data-testid="biometric-attempt-count"
      >
        {MAX_BIOMETRIC_ATTEMPTS - attempts} of {MAX_BIOMETRIC_ATTEMPTS} biometric attempts remaining.
      </p>
    </div>
  );
}
