"use client";

import { useEffect, useRef, useState } from "react";
import { Stepper, type StepperStep } from "@delegolabs/ui";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  createPasskeyCredential,
  isWebAuthnSupported,
  passkeyErrorMessage,
  registerPasskey,
  type PasskeyRegistrationResult,
} from "../../lib/passkey";

export interface PasskeyRegistrationStepperProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (credential: PasskeyRegistrationResult) => void;
  stellarAddress: string;
}

type StepId = "welcome" | "registering" | "success" | "error";

const STEPS: StepperStep[] = [
  { id: "welcome", label: "Welcome" },
  { id: "registering", label: "Register" },
  { id: "success", label: "Success" },
];

/**
 * Multi-step passkey registration flow with WebAuthn platform authenticator.
 * Guides users through registering a biometric passkey (Touch ID, Face ID, Windows Hello)
 * for authorizing micro-purchases without browser extension prompts.
 *
 * Flow:
 * 1. Welcome – explain what a passkey is and confirm device compatibility
 * 2. Registering – invoke navigator.credentials.create() with platform attachment
 * 3. Success – confirm registration and show credential details
 *
 * Origin validation is enforced in createPasskeyCredential to prevent credential replay attacks.
 */
export function PasskeyRegistrationStepper({
  isOpen,
  onClose,
  onSuccess,
  stellarAddress,
}: PasskeyRegistrationStepperProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [currentStep, setCurrentStep] = useState<StepId>("welcome");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<PasskeyRegistrationResult | null>(null);
  const supported = isWebAuthnSupported();

  useFocusTrap({ containerRef: panelRef, isActive: isOpen, onEscape: onClose });

  useEffect(() => {
    if (!isOpen) return;
    setCurrentStep("welcome");
    setName("");
    setError(null);
    setCredential(null);
    setSubmitting(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  async function handleRegister() {
    if (!supported || !stellarAddress || submitting) return;
    setCurrentStep("registering");
    setSubmitting(true);
    setError(null);
    try {
      const newCredential = await createPasskeyCredential(stellarAddress, name);
      await registerPasskey(newCredential, stellarAddress, name);
      setCredential(newCredential);
      setCurrentStep("success");
      onSuccess(newCredential);
    } catch (err) {
      setError(passkeyErrorMessage(err));
      setCurrentStep("error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetry() {
    setCurrentStep("welcome");
    setError(null);
  }

  function handleClose() {
    onClose();
  }

  return (
    <div className="passkey-stepper-overlay" onClick={handleClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Register a passkey"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="passkey-stepper-panel"
      >
        {/* Stepper indicator */}
        <Stepper
          steps={STEPS}
          currentIndex={Math.max(0, currentStepIndex)}
          onStepSelect={(index: number) => {
            // Only allow navigation to completed steps
            if (index < currentStepIndex && STEPS[index].id !== "success") {
              setCurrentStep(STEPS[index].id as StepId);
            }
          }}
        />

        {/* Step: Welcome */}
        {currentStep === "welcome" && (
          <div className="passkey-stepper-step">
            <div className="passkey-stepper-icon" aria-hidden="true">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ color: "var(--color-accent, #6366f1)" }}
              >
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            </div>
            <h2 style={{ margin: "0 0 0.5rem" }}>Register a passkey</h2>
            <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
              Use Face ID, Touch ID, or Windows Hello so agents can transact
              without a browser extension prompt.
            </p>

            {!stellarAddress && (
              <div className="passkey-stepper-alert" role="alert">
                Connect a Stellar wallet before registering a passkey.
              </div>
            )}

            {!supported && (
              <div className="passkey-stepper-alert" role="status">
                <strong>This device does not support passkeys.</strong>
                <br />
                You can keep signing with the Freighter browser extension.
                <br />
                <a
                  href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginTop: "0.5rem", display: "inline-block" }}
                >
                  Learn about WebAuthn browser support
                </a>
              </div>
            )}

            {supported && stellarAddress && (
              <label
                className="passkey-stepper-field"
                style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.5rem" }}
              >
                <span>Passkey name (optional)</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="This device"
                  style={{
                    padding: "0.625rem 0.75rem",
                    border: "1px solid var(--color-border, #d1d5db)",
                    borderRadius: "0.375rem",
                    fontSize: "0.9375rem",
                    width: "100%",
                  }}
                />
                <span className="passkey-stepper-hint">
                  A friendly name to identify this device later (e.g., &ldquo;MacBook Pro&rdquo;, &ldquo;iPhone 15&rdquo;)
                </span>
              </label>
            )}
          </div>
        )}

        {/* Step: Registering */}
        {currentStep === "registering" && (
          <div className="passkey-stepper-step" style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <div className="passkey-stepper-spinner" role="status" aria-label="Registering passkey" />
            <h3 style={{ margin: "1rem 0 0.5rem" }}>Registering passkey…</h3>
            <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
              Please complete the biometric prompt on your device.
            </p>
            {name && (
              <p style={{ margin: "0.75rem 0 0", fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
                Name: <strong>{name}</strong>
              </p>
            )}
          </div>
        )}

        {/* Step: Success */}
        {currentStep === "success" && credential && (
          <div className="passkey-stepper-step">
            <div className="passkey-stepper-icon" aria-hidden="true" style={{ color: "var(--color-success-text, #166534)" }}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <h2 style={{ margin: "0 0 0.5rem", color: "var(--color-success-text, #166534)" }}>
              Passkey registered!
            </h2>
            <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
              This device can now approve agent transactions without a browser extension prompt.
            </p>

            <details className="passkey-stepper-details" style={{ marginTop: "1rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: 500 }}>
                Credential details
              </summary>
              <dl style={{ margin: "0.75rem 0 0", fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                  <dt>Credential ID</dt>
                  <dd style={{ fontFamily: "monospace", maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {credential.credentialId.slice(0, 32)}…
                  </dd>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                  <dt>Algorithm</dt>
                  <dd>{credential.algorithm === -7 ? "ES256" : "RS256"}</dd>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <dt>Registered</dt>
                  <dd>{new Date(credential.createdAt).toLocaleString()}</dd>
                </div>
              </dl>
            </details>
          </div>
        )}

        {/* Step: Error */}
        {currentStep === "error" && (
          <div className="passkey-stepper-step">
            <div className="passkey-stepper-icon" aria-hidden="true" style={{ color: "var(--color-error-text, #991b1b)" }}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </div>
            <h2 style={{ margin: "0 0 0.5rem", color: "var(--color-error-text, #991b1b)" }}>
              Registration failed
            </h2>
            {error && (
              <p role="alert" style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                {error}
              </p>
            )}
            <p style={{ margin: "1rem 0 0", fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
              You can try again or continue using the Freighter browser extension.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="passkey-stepper-actions">
          {currentStep === "welcome" && supported && stellarAddress && (
            <>
              <Button variant="ghost" type="button" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={() => void handleRegister()}
                disabled={submitting}
                loading={submitting}
              >
                {submitting ? "Registering…" : "Register passkey"}
              </Button>
            </>
          )}
          {currentStep === "registering" && (
            <Button variant="ghost" type="button" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
          )}
          {currentStep === "success" && (
            <Button variant="primary" type="button" onClick={handleClose}>
              Done
            </Button>
          )}
          {currentStep === "error" && (
            <>
              <Button variant="ghost" type="button" onClick={handleRetry}>
                Try again
              </Button>
              <Button variant="secondary" type="button" onClick={handleClose}>
                Close
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}