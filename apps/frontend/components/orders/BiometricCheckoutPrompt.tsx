"use client";

/**
 * WebAuthn biometric fast-checkout modal for micro-purchases (#786).
 *
 * Triggers a platform-authenticator assertion (Touch ID / Face ID) on open,
 * posts the signed assertion to the gateway, then plays a short success
 * animation before invoking `onSuccess`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { apiFetch } from "../../lib/apiFetch";
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

export interface BiometricCheckoutPromptProps {
  orderAmount: string;
  merchantName: string;
  onSuccess(): void;
  /** Optional callback when the user abandons biometric checkout. */
  onCancel?: () => void;
  /** Order id echoed in the WebAuthn assertion payload. */
  orderId?: string;
}

type Phase = "preparing" | "scanning" | "submitting" | "success" | "error";

interface CheckoutAssertionBody {
  orderId: string;
  amount: string;
  merchantName: string;
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
  userHandle: string | null;
}

/** Parse the assertion JSON returned by `requestBiometricAssertion`. */
export function parseAssertion(assertion: string): Omit<CheckoutAssertionBody, "merchantName" | "orderId" | "amount"> {
  const parsed = JSON.parse(assertion) as {
    credentialId: string;
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle: string | null;
  };
  return {
    credentialId: parsed.credentialId,
    authenticatorData: parsed.authenticatorData,
    clientDataJSON: parsed.clientDataJSON,
    signature: parsed.signature,
    userHandle: parsed.userHandle ?? null,
  };
}

/**
 * Micro-purchase checkout powered by a registered passkey.
 *
 * On mount the modal requests a user-verifying assertion and submits it to
 * `POST /checkout/biometric`. Success shows a brief confirmation animation,
 * then calls `onSuccess`. Failures surface wallet-PIN guidance after
 * `MAX_BIOMETRIC_ATTEMPTS`.
 */
export function BiometricCheckoutPrompt({
  orderAmount,
  merchantName,
  onSuccess,
  onCancel,
  orderId,
}: BiometricCheckoutPromptProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("preparing");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [platformAuth, setPlatformAuth] = useState(false);
  const mountedRef = useRef(true);
  const attemptsRef = useRef(0);
  const successTimer = useRef<number | null>(null);

  useFocusTrap({ containerRef: panelRef, isActive: true, onEscape: onCancel });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (successTimer.current) window.clearTimeout(successTimer.current);
    };
  }, []);

  const runCheckout = useCallback(async () => {
    if (!isBiometricSupported()) {
      setPhase("error");
      setError(
        "This device does not support biometric verification. Approve with your wallet PIN instead."
      );
      return;
    }

    setPhase("scanning");
    setError(null);
    try {
      const assertion = await requestBiometricAssertion({
        orderId: orderId ?? "checkout",
        amount: orderAmount,
      });
      if (!mountedRef.current) return;

      setPhase("submitting");
      const body: CheckoutAssertionBody = {
        orderId: orderId ?? "checkout",
        amount: orderAmount,
        merchantName,
        ...parseAssertion(assertion),
      };
      const res = await apiFetch<{ ok: boolean }>("/checkout/biometric", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!mountedRef.current) return;
      if (res.error) {
        throw new Error(res.error.message || "Biometric checkout was rejected.");
      }

      attemptsRef.current = 0;
      setAttempts(0);
      setPhase("success");
      successTimer.current = window.setTimeout(() => {
        if (mountedRef.current) onSuccess();
      }, 900);
    } catch (err) {
      if (!mountedRef.current) return;
      const next = attemptsRef.current + 1;
      attemptsRef.current = next;
      setAttempts(next);
      if (shouldFallBackToPin(next)) {
        setPhase("error");
        setError(pinFallbackMessage(orderAmount));
        return;
      }
      setPhase("error");
      setError(biometricErrorMessage(err));
    }
  }, [merchantName, onCancel, orderId, onSuccess, orderAmount]);

  useEffect(() => {
    let cancelled = false;
    hasPlatformAuthenticator().then((available) => {
      if (!cancelled && mountedRef.current) setPlatformAuth(available);
    });
    void runCheckout();
    return () => {
      cancelled = true;
    };
  }, [runCheckout]);

  return (
    <div className="approval-drawer-overlay" onClick={onCancel} data-testid="biometric-checkout-overlay">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Biometric checkout"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        data-testid="biometric-checkout-modal"
        style={{
          background: "var(--color-surface, #fff)",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          maxWidth: "24rem",
          margin: "12vh auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Fast checkout</h2>
          <p style={{ margin: "0.25rem 0 0", color: "var(--color-text-muted, #64748b)", fontSize: "0.9rem" }}>
            {merchantName} · <strong data-testid="biometric-checkout-amount">{orderAmount}</strong>
          </p>
        </div>

        <AnimatePresence mode="wait">
          {phase === "success" ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              data-testid="biometric-checkout-success"
              className="flex flex-col items-center gap-2 py-4"
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.15, 1] }}
                transition={{ duration: 0.45 }}
                style={{
                  display: "inline-flex",
                  height: "3rem",
                  width: "3rem",
                  borderRadius: "9999px",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#d1fae5",
                  color: "#047857",
                  fontSize: "1.5rem",
                }}
              >
                ✓
              </motion.span>
              <p style={{ margin: 0, fontWeight: 600 }}>Payment authorized</p>
            </motion.div>
          ) : (
            <motion.div
              key="body"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center gap-3" data-testid="biometric-checkout-status">
                <span
                  data-scanning={phase === "scanning" || phase === "submitting"}
                  data-testid="biometric-checkout-glyph"
                  style={{
                    display: "inline-flex",
                    height: "2.5rem",
                    width: "2.5rem",
                    borderRadius: "9999px",
                    alignItems: "center",
                    justifyContent: "center",
                    background: phase === "error" ? "#fee2e2" : "#e0e7ff",
                    color: phase === "error" ? "#b91c1c" : "#3730a3",
                    fontSize: "1.25rem",
                  }}
                >
                  {phase === "error" ? "!" : "☝"}
                </span>
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    {phase === "preparing"
                      ? "Preparing Face ID / Touch ID…"
                      : phase === "scanning"
                        ? "Verify with Face ID / Touch ID"
                        : phase === "submitting"
                          ? "Authorizing purchase…"
                          : "Biometric verification failed"}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-muted, #64748b)" }}>
                    {platformAuth
                      ? `Approve this ${orderAmount} purchase in under 2 seconds`
                      : "Platform authenticator not detected"}
                    {attempts > 0
                      ? ` · ${remainingAttempts(attempts)} attempt${remainingAttempts(attempts) === 1 ? "" : "s"} left`
                      : ""}
                  </p>
                </div>
              </div>

              {error ? (
                <p
                  role="alert"
                  data-testid="biometric-checkout-error"
                  style={{ margin: 0, color: "#b91c1c", fontSize: "0.85rem" }}
                >
                  {error}
                </p>
              ) : null}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  data-testid="biometric-checkout-cancel"
                >
                  Cancel
                </Button>
                {phase === "error" && !shouldFallBackToPin(attempts) ? (
                  <Button
                    type="button"
                    onClick={() => void runCheckout()}
                    data-testid="biometric-checkout-retry"
                  >
                    Try again
                  </Button>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default BiometricCheckoutPrompt;
