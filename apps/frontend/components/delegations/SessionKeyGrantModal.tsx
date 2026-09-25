"use client";

import { useState } from "react";
import { Horizon, TransactionBuilder } from "@stellar/stellar-sdk";
import { StroopsInput } from "@delegolabs/ui";
import { useWallet } from "../../hooks/useWallet";
import { useNetwork } from "../../hooks/useNetwork";
import { ExpiryCountdown } from "./ExpiryCountdown";
import {
  SESSION_DURATION_OPTIONS,
  buildSessionKeyAuthTx,
  generateSessionKeypair,
  loadSessionKeyGrant,
  revokeSessionKeyGrant,
  saveSessionKeyGrant,
  type SessionKeyGrant,
} from "../../lib/sessionKeys";

export interface SessionKeyGrantModalProps {
  open: boolean;
  onClose: () => void;
  /** Contract calls this session key is scoped to (e.g. ["escrow.release", "order.approve"]). */
  allowedContractCalls: string[];
}

type Step = "form" | "signing" | "active" | "error";

/** Modal for granting an agent a time-bounded, spending-capped session key. */
export function SessionKeyGrantModal({ open, onClose, allowedContractCalls }: SessionKeyGrantModalProps) {
  const { address } = useWallet();
  const { network } = useNetwork();
  const [durationHours, setDurationHours] = useState(24);
  const [maxAllowanceStroops, setMaxAllowanceStroops] = useState<bigint>(0n);
  const [step, setStep] = useState<Step>("form");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeGrant, setActiveGrant] = useState<SessionKeyGrant | null>(loadSessionKeyGrant);

  if (!open) return null;

  async function handleGrant() {
    if (!address) {
      setErrorMessage("Connect a wallet first.");
      return;
    }
    if (maxAllowanceStroops <= 0n) {
      setErrorMessage("Enter a spending budget greater than zero.");
      return;
    }

    setStep("signing");
    setErrorMessage(null);
    try {
      const sessionKeypair = generateSessionKeypair();
      const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
      const grant: SessionKeyGrant = {
        sessionPublicKey: sessionKeypair.publicKey(),
        maxAllowanceStroops: maxAllowanceStroops.toString(),
        durationHours,
        allowedContractCalls,
        expiresAt,
      };

      const horizon = new Horizon.Server(network.horizonUrl);
      const sourceAccount = await horizon.loadAccount(address);
      const tx = buildSessionKeyAuthTx(sourceAccount, grant, network.networkPassphrase);

      const freighter = await import("@stellar/freighter-api");
      const signed = await freighter.signTransaction(tx.toXDR(), {
        networkPassphrase: network.networkPassphrase,
        address,
      });
      if (signed.error || !signed.signedTxXdr) {
        throw new Error(signed.error?.message ?? "Signing was cancelled or failed.");
      }

      const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, network.networkPassphrase);
      await horizon.submitTransaction(signedTx);

      saveSessionKeyGrant(grant);
      setActiveGrant(grant);
      setStep("active");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to grant session key.");
      setStep("error");
    }
  }

  function handleRevoke() {
    revokeSessionKeyGrant();
    setActiveGrant(null);
    setStep("form");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Grant session key"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Session key</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer" }}>
            ✕
          </button>
        </div>

        {activeGrant ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p style={{ fontSize: "0.8125rem", color: "#374151", margin: 0 }}>
              Session key <code>{activeGrant.sessionPublicKey.slice(0, 8)}…</code> is active with a{" "}
              {activeGrant.maxAllowanceStroops} stroop cap.
            </p>
            <ExpiryCountdown expiresAt={activeGrant.expiresAt} />
            <button
              type="button"
              onClick={handleRevoke}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                border: "none",
                background: "#dc2626",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Revoke Now
            </button>
          </div>
        ) : (
          <>
            <div>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Duration</span>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.375rem" }}>
                {SESSION_DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.hours}
                    type="button"
                    onClick={() => setDurationHours(opt.hours)}
                    style={{
                      padding: "0.375rem 0.625rem",
                      borderRadius: "0.5rem",
                      border: durationHours === opt.hours ? "2px solid #2563eb" : "1px solid #d1d5db",
                      background: durationHours === opt.hours ? "#eff6ff" : "#fff",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Spending budget</span>
              <StroopsInput value={maxAllowanceStroops} onChange={setMaxAllowanceStroops} />
            </label>

            {errorMessage && (
              <p role="alert" style={{ fontSize: "0.75rem", color: "#dc2626", margin: 0 }}>
                {errorMessage}
              </p>
            )}

            <button
              type="button"
              onClick={handleGrant}
              disabled={step === "signing"}
              style={{
                padding: "0.625rem 1rem",
                borderRadius: "0.5rem",
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 600,
                cursor: step === "signing" ? "wait" : "pointer",
              }}
            >
              {step === "signing" ? "Waiting for signature…" : "Grant session key"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
