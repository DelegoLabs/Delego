"use client";

import { useState } from "react";
import { Button } from "@delegolabs/ui";
import { useNetworkMismatch } from "../../hooks/useNetworkMismatch";

export interface NetworkMismatchModalProps {
  /** Optional override state for unit testing or controlled rendering */
  isMismatched?: boolean;
  walletNetworkLabel?: string;
  appNetworkLabel?: string;
  onSwitchAppNetwork?: () => void;
}

/**
 * Blocking modal rendered when the connected Freighter wallet's network
 * does not match the active app network configuration.
 *
 * Prevents transaction errors by forcing network reconciliation via two actions:
 * 1. Switch the app network to match the wallet.
 * 2. View step-by-step instructions for switching the network in Freighter.
 */
export function NetworkMismatchModal({
  isMismatched: isMismatchedProp,
  walletNetworkLabel: walletNetworkLabelProp,
  appNetworkLabel: appNetworkLabelProp,
  onSwitchAppNetwork,
}: NetworkMismatchModalProps = {}) {
  const realState = useNetworkMismatch();
  const [showInstructions, setShowInstructions] = useState(false);

  const isMismatched = isMismatchedProp ?? realState.isMismatched;
  const walletNetworkLabel =
    walletNetworkLabelProp ?? realState.walletNetworkLabel;
  const appNetworkLabel = appNetworkLabelProp ?? realState.appNetworkLabel;
  const handleSwitchAppNetwork =
    onSwitchAppNetwork ?? realState.switchToWalletNetwork;

  if (!isMismatched) {
    return null;
  }

  return (
    <div
      data-testid="network-mismatch-modal-backdrop"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="network-mismatch-title"
        data-testid="network-mismatch-modal"
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "0.75rem",
          maxWidth: "32rem",
          width: "100%",
          padding: "1.75rem",
          boxShadow:
            "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          border: "1px solid #fee2e2",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
          <div
            style={{
              backgroundColor: "#fee2e2",
              color: "#dc2626",
              borderRadius: "50%",
              padding: "0.625rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
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
              style={{ aspectRatio: "1/1" }}
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <div style={{ flex: 1 }}>
            <h2
              id="network-mismatch-title"
              style={{
                margin: 0,
                fontSize: "1.25rem",
                fontWeight: 600,
                color: "#111827",
              }}
            >
              Network Mismatch
            </h2>

            <p
              data-testid="network-mismatch-message"
              style={{
                margin: "0.5rem 0 1rem",
                fontSize: "0.9375rem",
                color: "#374151",
                lineHeight: 1.5,
                fontWeight: 500,
              }}
            >
              Your wallet is on <strong>{walletNetworkLabel}</strong> but the
              app is on <strong>{appNetworkLabel}</strong>
            </p>

            <p
              style={{
                margin: "0 0 1.25rem",
                fontSize: "0.875rem",
                color: "#6b7280",
                lineHeight: 1.4,
              }}
            >
              Signing transactions across mismatched Stellar networks will
              result in signing failures. Please align your wallet and app
              network settings to continue.
            </p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <Button
                variant="primary"
                onClick={handleSwitchAppNetwork}
                data-testid="switch-app-network-btn"
                style={{ width: "100%", justifyContent: "center" }}
              >
                Switch app network to {walletNetworkLabel}
              </Button>

              <Button
                variant="ghost"
                onClick={() => setShowInstructions((v) => !v)}
                data-testid="toggle-instructions-btn"
                style={{ width: "100%", justifyContent: "center" }}
              >
                {showInstructions
                  ? "Hide Freighter instructions"
                  : "Instructions to switch in extension"}
              </Button>
            </div>

            {showInstructions && (
              <div
                data-testid="freighter-instructions"
                style={{
                  marginTop: "1rem",
                  padding: "0.875rem 1rem",
                  backgroundColor: "#f9fafb",
                  borderRadius: "0.5rem",
                  border: "1px solid #e5e7eb",
                  fontSize: "0.8125rem",
                  color: "#4b5563",
                  lineHeight: 1.5,
                }}
              >
                <p
                  style={{
                    margin: "0 0 0.5rem",
                    fontWeight: 600,
                    color: "#1f2937",
                  }}
                >
                  How to switch networks in Freighter:
                </p>
                <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
                  <li>
                    Open the <strong>Freighter extension</strong> from your
                    browser toolbar.
                  </li>
                  <li>
                    Click on the <strong>Network dropdown</strong> or Settings
                    gear icon.
                  </li>
                  <li>
                    Select <strong>{appNetworkLabel}</strong> to match the app.
                  </li>
                  <li>The app will automatically update once switched.</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
