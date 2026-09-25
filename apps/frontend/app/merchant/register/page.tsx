"use client";

import { useState } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { Stepper } from "@delegolabs/ui";
import { useWallet } from "../../../hooks/useWallet";
import { useNetwork } from "../../../hooks/useNetwork";
import { resolveProofHashExplorerUrl, truncateHash } from "../../../lib/proofAttachments";
import { CopyButton } from "../../../components/wallet/CopyButton";
import {
  MERCHANT_CATEGORIES,
  isValidContactEmail,
  registerMerchant,
  type MerchantRegistrationForm,
  type OnboardingStep,
} from "../../../lib/merchantRegistration";

const STEPS: { id: OnboardingStep; label: string }[] = [
  { id: "store_info", label: "Store info" },
  { id: "wallet_verify", label: "Verify wallet" },
  { id: "contract_register", label: "Register" },
  { id: "complete", label: "Complete" },
];

const EMPTY_FORM: MerchantRegistrationForm = {
  storeName: "",
  description: "",
  contactEmail: "",
  stellarPayoutAddress: "",
  category: "other",
  websiteUrl: "",
};

export default function MerchantRegisterPage() {
  const { address, isConnected, connect } = useWallet();
  const { network } = useNetwork();
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<MerchantRegistrationForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof MerchantRegistrationForm, string>>>({});
  const [walletProof, setWalletProof] = useState<{ signerAddress: string; signedMessage: string } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  const step = STEPS[stepIndex].id;

  function validateStoreInfo(): boolean {
    const errors: typeof formErrors = {};
    if (!form.storeName.trim()) errors.storeName = "Store name is required.";
    if (!form.description.trim()) errors.description = "Description is required.";
    if (!isValidContactEmail(form.contactEmail)) errors.contactEmail = "Enter a valid email address.";
    if (!StrKey.isValidEd25519PublicKey(form.stellarPayoutAddress.trim())) {
      errors.stellarPayoutAddress = "Enter a valid Stellar public key (starts with G).";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleStoreInfoNext() {
    if (validateStoreInfo()) setStepIndex(1);
  }

  async function handleVerifyWallet() {
    setVerifyError(null);
    if (!isConnected) {
      await connect();
      return;
    }
    setVerifying(true);
    try {
      const freighter = await import("@stellar/freighter-api");
      const message = `Delego merchant registration for "${form.storeName}" — ${new Date().toISOString()}`;
      const result = await freighter.signMessage(message, {
        networkPassphrase: network.networkPassphrase,
        address: address ?? undefined,
      });
      if (result.error || !result.signedMessage) {
        throw new Error(result.error?.message ?? "Signature was cancelled or failed.");
      }
      setWalletProof({
        signerAddress: result.signerAddress,
        signedMessage:
          typeof result.signedMessage === "string"
            ? result.signedMessage
            : Buffer.from(result.signedMessage).toString("base64"),
      });
      setStepIndex(2);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Wallet verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleRegister() {
    if (!walletProof) return;
    setRegistering(true);
    setRegisterError(null);
    try {
      const result = await registerMerchant(form, walletProof);
      setTransactionHash(result.transactionHash);
      setStepIndex(3);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setRegistering(false);
    }
  }

  const explorerUrl = transactionHash ? resolveProofHashExplorerUrl(transactionHash, network.id) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 520 }}>
      <h1>Register your store</h1>

      <Stepper steps={STEPS} currentIndex={stepIndex} />

      {step === "store_info" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {(
            [
              ["storeName", "Store name", "text"],
              ["contactEmail", "Contact email", "email"],
              ["stellarPayoutAddress", "Stellar payout address", "text"],
              ["websiteUrl", "Website URL (optional)", "url"],
            ] as const
          ).map(([field, label, type]) => (
            <label key={field} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{label}</span>
              <input
                type={type}
                value={form[field] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                style={{
                  padding: "0.5rem 0.625rem",
                  borderRadius: "0.5rem",
                  border: `1px solid ${formErrors[field] ? "#dc2626" : "#d1d5db"}`,
                }}
              />
              {formErrors[field] && (
                <span role="alert" style={{ fontSize: "0.75rem", color: "#dc2626" }}>
                  {formErrors[field]}
                </span>
              )}
            </label>
          ))}

          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Description</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
              style={{
                padding: "0.5rem 0.625rem",
                borderRadius: "0.5rem",
                border: `1px solid ${formErrors.description ? "#dc2626" : "#d1d5db"}`,
              }}
            />
            {formErrors.description && (
              <span role="alert" style={{ fontSize: "0.75rem", color: "#dc2626" }}>
                {formErrors.description}
              </span>
            )}
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Category</span>
            <select
              value={form.category}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, category: e.target.value as MerchantRegistrationForm["category"] }))
              }
              style={{ padding: "0.5rem 0.625rem", borderRadius: "0.5rem", border: "1px solid #d1d5db" }}
            >
              {MERCHANT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleStoreInfoNext}
            style={{ padding: "0.625rem 1rem", borderRadius: "0.5rem", border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, cursor: "pointer" }}
          >
            Continue
          </button>
        </div>
      )}

      {step === "wallet_verify" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <p style={{ fontSize: "0.8125rem", color: "#374151" }}>
            {isConnected
              ? "Sign a message with your wallet to prove you control this address before registering."
              : "Connect your wallet to continue."}
          </p>
          {verifyError && (
            <p role="alert" style={{ fontSize: "0.8125rem", color: "#dc2626" }}>
              {verifyError}
            </p>
          )}
          <button
            type="button"
            onClick={handleVerifyWallet}
            disabled={verifying}
            style={{ padding: "0.625rem 1rem", borderRadius: "0.5rem", border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, cursor: verifying ? "wait" : "pointer" }}
          >
            {verifying ? "Waiting for signature…" : isConnected ? "Sign to verify" : "Connect wallet"}
          </button>
        </div>
      )}

      {step === "contract_register" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <p style={{ fontSize: "0.8125rem", color: "#374151" }}>
            Wallet verified as <code>{walletProof?.signerAddress}</code>. Submit your registration to the
            delego-marketplace contract.
          </p>
          {registerError && (
            <p role="alert" style={{ fontSize: "0.8125rem", color: "#dc2626" }}>
              {registerError}
            </p>
          )}
          <button
            type="button"
            onClick={handleRegister}
            disabled={registering}
            style={{ padding: "0.625rem 1rem", borderRadius: "0.5rem", border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, cursor: registering ? "wait" : "pointer" }}
          >
            {registering ? "Registering…" : "Register on-chain"}
          </button>
        </div>
      )}

      {step === "complete" && transactionHash && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#166534" }}>
            🎉 {form.storeName} is registered!
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem" }}>
            <span>Soroban transaction:</span>
            <code>{truncateHash(transactionHash)}</code>
            <CopyButton value={transactionHash} label="Copy transaction hash" />
            {explorerUrl && (
              <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                View
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
