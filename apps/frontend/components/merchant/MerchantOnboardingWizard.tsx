/**
 * Multi-step merchant onboarding wizard with domain verification.
 *
 * Steps:
 * 1. Store Details - Basic store information
 * 2. Payout Address - Stellar payout configuration
 * 3. Contract Binding - Soroban contract identity binding
 * 4. Verification - Domain ownership verification via SEP-0001
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Stepper, Card, Button } from "@delegolabs/ui";
import { useWallet } from "../../hooks/useWallet";
import { useNetwork } from "../../hooks/useNetwork";
import {
  isValidContactEmail,
  isValidStoreSlug,
  generateStoreSlug,
  validateDomainFormat,
  registerMerchant,
  loadOnboardingState,
  saveOnboardingState,
  clearOnboardingState,
  type MerchantOnboardingData,
  type MerchantRegistrationForm,
  type OnboardingStep,
} from "../../lib/merchantRegistration";
import { verifyDomainOwnership, type DomainVerificationResult } from "../../lib/merchantDomainVerification";
import { CopyButton } from "../wallet/CopyButton";
import { truncateHash } from "../../lib/proofAttachments";
import { resolveProofHashExplorerUrl } from "../../lib/proofAttachments";
import {
  WALLET_CANCELLED_MESSAGE,
  WalletActionError,
  classifyWalletError,
  isUserDeclined,
} from "../../services/wallet";

const STEPS: { id: OnboardingStep; label: string; description: string }[] = [
  { id: "store_details", label: "Store Details", description: "Basic store information" },
  { id: "payout_address", label: "Payout Address", description: "Configure Stellar payout" },
  { id: "contract_binding", label: "Contract Binding", description: "Bind Soroban contract" },
  { id: "verification", label: "Verification", description: "Domain verification" },
  { id: "complete", label: "Complete", description: "Registration successful" },
];

interface MerchantOnboardingWizardProps {
  onComplete?: (data: MerchantOnboardingData, transactionHash: string) => void;
  onCancel?: () => void;
}

export function MerchantOnboardingWizard({ onComplete, onCancel }: MerchantOnboardingWizardProps) {
  const { address, isConnected, connect } = useWallet();
  const { network } = useNetwork();
  const [stepIndex, setStepIndex] = useState(0);
  const [formData, setFormData] = useState<MerchantOnboardingData>({
    storeName: "",
    storeSlug: "",
    description: "",
    contactEmail: "",
    payoutAddress: "",
    domainName: "",
    isDomainVerified: false,
    acceptedCurrencies: ["XLM"],
  });
  const [errors, setErrors] = useState<Partial<Record<keyof MerchantOnboardingData, string>>>({});
  const [walletProof, setWalletProof] = useState<{ signerAddress: string; signedMessage: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [loadingFromStorage, setLoadingFromStorage] = useState(true);

  // Load persisted state on mount
  useEffect(() => {
    const persisted = loadOnboardingState();
    if (persisted) {
      setFormData(persisted);
      // Determine which step to resume at
      if (persisted.isDomainVerified) {
        setStepIndex(3); // Verification complete
      } else {
        setStepIndex(2); // Contract binding
      }
    }
    setLoadingFromStorage(false);
  }, []);

  // Save state whenever form changes
  useEffect(() => {
    if (!loadingFromStorage) {
      saveOnboardingState(formData);
    }
  }, [formData, loadingFromStorage]);

  const currentStep = STEPS[stepIndex].id;

  // Step validation helpers
  const validateStoreDetails = (): boolean => {
    const newErrors: typeof errors = {};
    if (!formData.storeName.trim()) newErrors.storeName = "Store name is required.";
    if (!formData.description.trim()) newErrors.description = "Description is required.";
    if (!isValidContactEmail(formData.contactEmail)) newErrors.contactEmail = "Enter a valid email address.";
    if (!formData.storeSlug.trim()) newErrors.storeSlug = "Store slug is required.";
    else if (!isValidStoreSlug(formData.storeSlug)) newErrors.storeSlug = "Slug must be lowercase alphanumeric with hyphens.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validatePayoutAddress = (): boolean => {
    const newErrors: typeof errors = {};
    if (!formData.payoutAddress.trim()) newErrors.payoutAddress = "Payout address is required.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateDomain = (): boolean => {
    const newErrors: typeof errors = {};
    if (!formData.domainName.trim()) newErrors.domainName = "Domain name is required.";
    else {
      const validation = validateDomainFormat(formData.domainName);
      if (!validation.valid) newErrors.domainName = validation.error;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = useCallback((field: keyof MerchantOnboardingData, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleGenerateSlug = useCallback(() => {
    const slug = generateStoreSlug(formData.storeName);
    setFormData((prev) => ({ ...prev, storeSlug: slug }));
  }, [formData.storeName]);

  const handleStoreSlugChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, storeSlug: e.target.value }));
  }, []);

  const handleNext = async () => {
    if (currentStep === "store_details") {
      if (!validateStoreDetails()) return;
      setStepIndex((prev) => prev + 1);
    } else if (currentStep === "payout_address") {
      if (!validatePayoutAddress()) return;
      setStepIndex((prev) => prev + 1);
    } else if (currentStep === "contract_binding") {
      await handleVerifyWallet();
    } else if (currentStep === "verification") {
      if (!validateDomain()) return;
      await handleVerifyDomain();
    } else if (currentStep === "complete") {
      if (transactionHash && onComplete) {
        onComplete(formData, transactionHash);
      }
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((prev) => prev + 1);
    }
  };

  const handleCancel = () => {
    clearOnboardingState();
    if (onCancel) onCancel();
  };

  // Wallet verification for contract binding
  const handleVerifyWallet = async () => {
    if (!isConnected) {
      await connect();
      return;
    }
    setVerifying(true);
    setVerifyError(null);
    setVerifySuccess(null);
    try {
      const freighter = await import("@stellar/freighter-api");
      const message = `Register merchant ${formData.storeName} on ${new Date().toISOString()}`;
      const result = await freighter.signMessage(message, {
        networkPassphrase: network.networkPassphrase,
        address: address ?? undefined,
      });
      if (result.error || !result.signedMessage) {
        throw new WalletActionError(
          classifyWalletError(result.error ?? "Signature was cancelled or failed.")
        );
      }
      setWalletProof({
        signerAddress: result.signerAddress,
        signedMessage:
          typeof result.signedMessage === "string"
            ? result.signedMessage
            : Buffer.from(result.signedMessage).toString("base64"),
      });
      setVerifySuccess("Wallet verified successfully!");
      setStepIndex((prev) => prev + 1);
    } catch (err) {
      if (isUserDeclined(err)) {
        setVerifyError(WALLET_CANCELLED_MESSAGE);
      } else {
        setVerifyError(err instanceof Error ? err.message : "Wallet verification failed.");
      }
    } finally {
      setVerifying(false);
    }
  };

  // Domain verification
  const handleVerifyDomain = async () => {
    if (!address) {
      setVerifyError("Please connect your wallet first.");
      return;
    }
    setVerifying(true);
    setVerifyError(null);
    setVerifySuccess(null);
    try {
      const result = await verifyDomainOwnership(formData.domainName, address);
      if (result.valid) {
        setFormData((prev) => ({ ...prev, isDomainVerified: true }));
        setVerifySuccess(`Domain verified! SIGNING_KEY: ${result.signingKey}`);
        setStepIndex((prev) => prev + 1);
      } else {
        setVerifyError(result.error || "Domain verification failed.");
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Domain verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  // Final registration
  const handleRegister = async () => {
    if (!walletProof) {
      setRegisterError("Wallet verification is required before registration.");
      return;
    }
    setRegistering(true);
    setRegisterError(null);
    try {
      const registrationPayload: MerchantRegistrationForm = {
        storeName: formData.storeName,
        storeSlug: formData.storeSlug,
        description: formData.description,
        contactEmail: formData.contactEmail,
        stellarPayoutAddress: formData.payoutAddress,
        category: "other",
        websiteUrl: "",
      };
      const result = await registerMerchant(registrationPayload, walletProof);
      setTransactionHash(result.transactionHash);
      clearOnboardingState();
      setStepIndex((prev) => prev + 1);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setRegistering(false);
    }
  };

  const explorerUrl = transactionHash ? resolveProofHashExplorerUrl(transactionHash, network.id) : null;
  const canGoBack = stepIndex > 0;
  const canGoForward = stepIndex < STEPS.length - 1;

  // Loading state
  if (loadingFromStorage) {
    return (
      <div className="merchant-onboarding">
        <Card title="Loading..." ariaLabel="Loading onboarding state">
          <p>Restoring your previous progress...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="merchant-onboarding">
      <header className="merchant-onboarding-header">
        <h1>Register your store</h1>
        <p>Complete the steps below to set up your storefront profile.</p>
      </header>

      <Stepper steps={STEPS.map((s) => ({ id: s.label, label: s.label }))} currentIndex={stepIndex} />

      <Card title={STEPS[stepIndex].label} ariaLabel={`Step ${stepIndex + 1}: ${STEPS[stepIndex].label}`}>
        {currentStep === "store_details" && (
          <div className="merchant-onboarding-step">
            <div className="form-group">
              <label htmlFor="storeName">Store name</label>
              <input
                id="storeName"
                value={formData.storeName}
                onChange={(e) => handleInputChange("storeName", e.target.value)}
                aria-invalid={Boolean(errors.storeName)}
              />
              {errors.storeName ? <div className="error-message">{errors.storeName}</div> : null}
            </div>

            <div className="form-group">
              <label htmlFor="storeSlug">Store slug (URL-friendly identifier)</label>
              <div className="input-group">
                <input
                  id="storeSlug"
                  value={formData.storeSlug}
                  onChange={handleStoreSlugChange}
                  aria-invalid={Boolean(errors.storeSlug)}
                />
                <Button
                  variant="secondary"
                  onClick={handleGenerateSlug}
                  type="button"
                >
                  Generate
                </Button>
              </div>
              {errors.storeSlug ? <div className="error-message">{errors.storeSlug}</div> : null}
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange("description", e.target.value)}
                rows={4}
                aria-invalid={Boolean(errors.description)}
              />
              {errors.description ? <div className="error-message">{errors.description}</div> : null}
            </div>

            <div className="form-group">
              <label htmlFor="contactEmail">Contact email</label>
              <input
                id="contactEmail"
                type="email"
                value={formData.contactEmail}
                onChange={(e) => handleInputChange("contactEmail", e.target.value)}
                aria-invalid={Boolean(errors.contactEmail)}
              />
              {errors.contactEmail ? <div className="error-message">{errors.contactEmail}</div> : null}
            </div>

            <div className="form-group">
              <label htmlFor="acceptedCurrencies">Accepted currencies</label>
              <select
                id="acceptedCurrencies"
                multiple
                value={formData.acceptedCurrencies}
                onChange={(e) => handleInputChange("acceptedCurrencies", Array.from(e.target.selectedOptions, (option) => option.value))}
              >
                {[
                  { value: "XLM", label: "XLM (Stellar)" },
                  { value: "USD", label: "USD" },
                  { value: "EUR", label: "EUR" },
                  { value: "GBP", label: "GBP" },
                  { value: "JPY", label: "JPY" },
                ].map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-actions">
              <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
              <Button variant="primary" onClick={handleNext} disabled={!formData.storeName.trim() || !formData.description.trim()}>
                Next
              </Button>
            </div>
          </div>
        )}

        {currentStep === "payout_address" && (
          <div className="merchant-onboarding-step">
            <p className="step-intro">Configure where payments will be sent when orders are fulfilled.</p>
            <div className="form-group">
              <label htmlFor="payoutAddress">Stellar payout address (G...)</label>
              <input
                id="payoutAddress"
                value={formData.payoutAddress}
                onChange={(e) => handleInputChange("payoutAddress", e.target.value)}
                aria-invalid={Boolean(errors.payoutAddress)}
                placeholder="G..."
              />
              {errors.payoutAddress ? <div className="error-message">{errors.payoutAddress}</div> : null}
              <p className="hint">
                Your address must be funded on {network.label} before it can receive payments.
              </p>
            </div>

            <div className="form-actions">
              <Button variant="ghost" onClick={handleBack}>Back</Button>
              <Button variant="primary" onClick={handleNext} disabled={!formData.payoutAddress.trim()}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Contract Binding Step */}
        {currentStep === "contract_binding" && (
          <div className="merchant-onboarding-step">
            <p className="step-intro">
              Verify wallet ownership to bind your Soroban contract identity.
            </p>

            <div className="wallet-status">
              {isConnected ? (
                <div className="wallet-connected">
                  <span className="wallet-address">{address}</span>
                  <span className="wallet-network">{network.label}</span>
                </div>
              ) : (
                <div className="wallet-not-connected">
                  <p>Wallet not connected</p>
                  <Button variant="primary" onClick={async () => { await connect(); }} type="button">
                    Connect Wallet
                  </Button>
                </div>
              )}
            </div>

            {walletProof ? (
              <div className="verification-success">
                <p>Wallet verified: {walletProof.signerAddress}</p>
              </div>
            ) : null}

            {verifyError && (
              <div className="error-message" role="alert">
                {verifyError}
              </div>
            )}

            {verifySuccess && (
              <div className="success-message">
                {verifySuccess}
              </div>
            )}

            <div className="form-actions">
              <Button variant="ghost" onClick={handleBack}>
                Back
              </Button>
              <Button
                variant="primary"
                onClick={handleVerifyWallet}
                disabled={verifying || !isConnected}
                loading={verifying}
              >
                {isConnected ? "Verify Wallet" : "Connect Wallet"}
              </Button>
            </div>
          </div>
        )}

        {/* Verification Step */}
        {currentStep === "verification" && (
          <div className="merchant-onboarding-step">
            <p className="step-intro">
              Verify domain ownership via SEP-0001 stellar.toml configuration.
            </p>

            <div className="form-group">
              <label htmlFor="domainName">Domain name</label>
              <input
                id="domainName"
                value={formData.domainName}
                onChange={(e) => handleInputChange("domainName", e.target.value)}
                aria-invalid={Boolean(errors.domainName)}
                placeholder="example.com"
              />
              {errors.domainName ? <div className="error-message">{errors.domainName}</div> : null}
              <p className="hint">
                Your domain must have a <code>/.well-known/stellar.toml</code> file with a matching SIGNING_KEY.
              </p>
            </div>

            {formData.isDomainVerified ? (
              <div className="verification-success">
                <p>Domain verified: {formData.domainName}</p>
                <p>SIGNING_KEY matches your address: {address}</p>
              </div>
            ) : null}

            {verifyError && (
              <div className="error-message" role="alert">
                {verifyError}
              </div>
            )}

            {verifySuccess && (
              <div className="success-message">
                {verifySuccess}
              </div>
            )}

            <div className="form-actions">
              <Button variant="ghost" onClick={handleBack}>
                Back
              </Button>
              <Button
                variant="primary"
                onClick={handleNext}
                disabled={verifying || !formData.domainName.trim() || !isConnected}
                loading={verifying}
              >
                {formData.isDomainVerified ? "Skip" : "Verify Domain"}
              </Button>
            </div>
          </div>
        )}

        {/* Complete Step */}
        {currentStep === "complete" && transactionHash && (
          <div className="merchant-onboarding-step">
            <div className="success-icon">🎉</div>
            <h2>Registration Successful!</h2>
            <p>{formData.storeName} has been registered on {network.label}.</p>

            <div className="transaction-details">
              <h3>Soroban Transaction</h3>
              <div className="hash-display">
                <code>{transactionHash}</code>
                <CopyButton value={transactionHash} label="Copy transaction hash" />
              </div>
              {explorerUrl && (
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="view-link">
                  View on Explorer
                </a>
              )}
            </div>

            <div className="store-preview">
              <h3>Store Preview</h3>
              <div className="store-info">
                <strong>{formData.storeName}</strong>
                <p>{formData.description}</p>
                <p>Email: {formData.contactEmail}</p>
                <p>Domain: {formData.domainName}</p>
                <p>Payout: {formData.payoutAddress}</p>
              </div>
            </div>

            <div className="form-actions">
              <Button
                variant="primary"
                onClick={() => onComplete && onComplete(formData, transactionHash)}
              >
                Finish
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Navigation controls */}
      {currentStep !== "complete" && (
        <div className="merchant-onboarding-footer">
          {canGoBack && (
            <Button variant="ghost" onClick={handleBack} type="button">
              Back
            </Button>
          )}
          {currentStep !== "store_details" && currentStep !== "payout_address" && (
            <Button variant="ghost" onClick={handleSkip} type="button">
              Skip Step
            </Button>
          )}
          {canGoForward && (
            <Button
              variant="primary"
              onClick={handleNext}
              type="button"
              disabled={
                (currentStep === "store_details" && (!formData.storeName.trim() || !formData.description.trim())) ||
                (currentStep === "payout_address" && !formData.payoutAddress.trim()) ||
                (currentStep === "verification" && !formData.domainName.trim())
              }
            >
              Next
            </Button>
          )}
        </div>
      )}
    </div>
  );
}