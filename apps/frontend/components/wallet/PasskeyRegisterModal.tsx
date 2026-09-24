"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  createPasskeyCredential,
  isWebAuthnSupported,
  passkeyErrorMessage,
  registerPasskey,
  type PasskeyCredential,
} from "../../lib/passkey";

export interface PasskeyRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (credential: PasskeyCredential) => void;
  stellarAddress: string;
}

/** Registers a platform passkey (Face ID / Touch ID) for the connected account (#696). */
export function PasskeyRegisterModal({
  isOpen,
  onClose,
  onSuccess,
  stellarAddress,
}: PasskeyRegisterModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = isWebAuthnSupported();

  useFocusTrap(panelRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setError(null);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleRegister() {
    if (!supported || !stellarAddress || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const credential = await createPasskeyCredential(stellarAddress, name);
      await registerPasskey(credential, stellarAddress);
      onSuccess(credential);
    } catch (err) {
      setError(passkeyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="approval-drawer-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Register a passkey"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface, #fff)",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          maxWidth: "28rem",
          margin: "10vh auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h2 style={{ margin: 0 }}>Register a passkey</h2>
        <p style={{ margin: 0 }}>
          Use Face ID or Touch ID so agents can transact without a browser
          extension prompt.
        </p>

        {!stellarAddress && (
          <p role="alert" style={{ margin: 0 }}>
            Connect a Stellar wallet before registering a passkey.
          </p>
        )}

        {!supported && (
          <p role="status" style={{ margin: 0 }}>
            This device does not support passkeys. You can keep signing with
            the Freighter browser extension.
          </p>
        )}

        {supported && stellarAddress && (
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            Passkey name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="This device"
              style={{ padding: "0.5rem", width: "100%" }}
            />
          </label>
        )}

        {error && (
          <p role="alert" style={{ margin: 0, color: "#991b1b" }}>
            {error}
          </p>
        )}

        <div className="form-actions">
          <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => void handleRegister()}
            disabled={!supported || !stellarAddress || submitting}
            loading={submitting}
          >
            {submitting ? "Registering…" : "Register passkey"}
          </Button>
        </div>
      </div>
    </div>
  );
}
