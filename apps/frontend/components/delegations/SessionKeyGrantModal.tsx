"use client";

import { useEffect, useRef, useState } from "react";
import { Horizon, TransactionBuilder, StrKey } from "@stellar/stellar-sdk";
import { StroopsInput } from "@delegolabs/ui";
import { useWallet } from "../../hooks/useWallet";
import { useNetwork } from "../../hooks/useNetwork";
import { ExpiryCountdown } from "./ExpiryCountdown";
import {
  SESSION_DURATION_OPTIONS,
  buildSessionKeyAuthTx,
  generateSessionKeypair,
  initSessionKeyWorker,
  loadSessionKeyGrant,
  revokeSessionKeyGrant,
  saveSessionKeyGrant,
  type SessionKeyGrant,
  type GranularSessionScope,
} from "../../lib/sessionKeys";
import {
  WALLET_CANCELLED_MESSAGE,
  WalletActionError,
  classifyWalletError,
  isUserDeclined,
} from "../../services/wallet";
import type { SessionKeyWorkerMessage } from "../../lib/sessionKeys";

export interface SessionKeyGrantModalProps {
  open: boolean;
  onClose: () => void;
  allowedContractCalls: string[];
}

type Step = "form" | "signing" | "active" | "error";

export function SessionKeyGrantModal({ open, onClose, allowedContractCalls }: SessionKeyGrantModalProps) {
  const { address } = useWallet();
  const { network } = useNetwork();
  const [durationHours, setDurationHours] = useState(24);
  const [maxAllowanceStroops, setMaxAllowanceStroops] = useState<bigint>(0n);
  const [maxPerOrderStroops, setMaxPerOrderStroops] = useState<bigint>(0n);
  const [merchantAddressesInput, setMerchantAddressesInput] = useState("");
  const [categoriesInput, setCategoriesInput] = useState("");

  const [step, setStep] = useState<Step>("form");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [activeGrant, setActiveGrant] = useState<SessionKeyGrant | null>(loadSessionKeyGrant);
  const workerRef = useRef<Worker | null>(null);
  const keyIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      const worker = workerRef.current;
      if (worker) {
        const message: SessionKeyWorkerMessage = { type: "CLEAR_KEY" };
        worker.postMessage(message);
        worker.terminate();
        workerRef.current = null;
      }
      keyIdRef.current = null;
    };
  }, []);

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

    // Granular validation
    if (maxPerOrderStroops < 0n) {
      setErrorMessage("Max amount per order must be positive.");
      return;
    }
    if (maxPerOrderStroops > 0n && maxPerOrderStroops > maxAllowanceStroops) {
      setErrorMessage("Max per-order amount cannot exceed total spending budget.");
      return;
    }

    const merchants = merchantAddressesInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const m of merchants) {
      if (!StrKey.isValidEd25519PublicKey(m)) {
        setErrorMessage(`Invalid Stellar merchant address: ${m}`);
        return;
      }
    }

    const categories = categoriesInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const granularScope: GranularSessionScope = {
      maxAmountPerOrderStroops: maxPerOrderStroops.toString(),
      allowedMerchantAddresses: merchants,
      allowedCategories: categories,
      maxTotalSpendStroops: maxAllowanceStroops.toString(),
    };

    setStep("signing");
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      const sessionKeypair = generateSessionKeypair();
      const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
      const worker = initSessionKeyWorker();
      workerRef.current = worker;
      const keyId = sessionKeypair.publicKey();
      keyIdRef.current = keyId;
      const initMessage: SessionKeyWorkerMessage = { type: "INIT_KEY", keyId };
      worker.postMessage(initMessage);

      const grant: SessionKeyGrant = {
        sessionPublicKey: sessionKeypair.publicKey(),
        maxAllowanceStroops: maxAllowanceStroops.toString(),
        durationHours,
        allowedContractCalls,
        expiresAt,
        granularScope,
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
        throw new WalletActionError(
          classifyWalletError(signed.error ?? "Signing was cancelled or failed.")
        );
      }

      const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, network.networkPassphrase);
      await horizon.submitTransaction(signedTx);

      const signMessage: SessionKeyWorkerMessage = {
        type: "SIGN_PAYLOAD",
        payload: new TextEncoder().encode(signed.signedTxXdr),
        keyId,
      };
      worker.postMessage(signMessage);

      saveSessionKeyGrant(grant);
      setActiveGrant(grant);
      setStep("active");
    } catch (err) {
      if (isUserDeclined(err)) {
        setStep("form");
        setNoticeMessage(WALLET_CANCELLED_MESSAGE);
      } else {
        setErrorMessage(err instanceof Error ? err.message : "Failed to grant session key.");
        setStep("error");
      }
    }
  }

  function handleRevoke() {
    const worker = workerRef.current;
    if (worker) {
      const message: SessionKeyWorkerMessage = { type: "CLEAR_KEY" };
      worker.postMessage(message);
      worker.terminate();
      workerRef.current = null;
    }
    keyIdRef.current = null;
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
          maxWidth: 460,
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          maxHeight: "90vh",
          overflowY: "auto",
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
            {activeGrant.granularScope && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }} data-testid="permission-chips">
                <span className="bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5 rounded-full font-medium">
                  Max/Order: {activeGrant.granularScope.maxAmountPerOrderStroops} stroops
                </span>
                {activeGrant.granularScope.allowedMerchantAddresses.length > 0 && (
                  <span className="bg-green-100 text-green-800 text-[11px] px-2 py-0.5 rounded-full font-medium">
                    Merchants: {activeGrant.granularScope.allowedMerchantAddresses.length} whitelisted
                  </span>
                )}
                {activeGrant.granularScope.allowedCategories.length > 0 && (
                  <span className="bg-purple-100 text-purple-800 text-[11px] px-2 py-0.5 rounded-full font-medium">
                    Categories: {activeGrant.granularScope.allowedCategories.join(", ")}
                  </span>
                )}
              </div>
            )}
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
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Total spending budget (stroops)</span>
              <StroopsInput value={maxAllowanceStroops} onChange={setMaxAllowanceStroops} />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Max per-order amount (stroops)</span>
              <StroopsInput value={maxPerOrderStroops} onChange={setMaxPerOrderStroops} />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Allowed merchant addresses (comma-separated)</span>
              <input
                type="text"
                placeholder="G..., G..."
                value={merchantAddressesInput}
                onChange={(e) => setMerchantAddressesInput(e.target.value)}
                style={{ padding: "0.375rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", fontSize: "0.8125rem" }}
                data-testid="input-merchant-addresses"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Allowed categories (comma-separated)</span>
              <input
                type="text"
                placeholder="electronics, groceries"
                value={categoriesInput}
                onChange={(e) => setCategoriesInput(e.target.value)}
                style={{ padding: "0.375rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", fontSize: "0.8125rem" }}
                data-testid="input-categories"
              />
            </label>

            {noticeMessage && (
              <p role="status" aria-live="polite" className="wallet-notice" style={{ fontSize: "0.75rem", margin: 0 }}>
                {noticeMessage}
              </p>
            )}

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
