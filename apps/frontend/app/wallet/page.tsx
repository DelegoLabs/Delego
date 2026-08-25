"use client";

import { Card, ErrorBoundary } from "@delego/ui";
import { useWallet } from "../../hooks/useWallet";
import { WalletConnectButton } from "../../components/wallet/WalletConnectButton";

const STATUS_LABEL: Record<string, string> = {
  checking: "Checking for Freighter…",
  unavailable: "Freighter extension not detected",
  disconnected: "Not connected",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Connection error",
};

export default function WalletPage() {
  const { status, address, network, networkPassphrase, error } = useWallet();

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Wallet</h1>
        <p>Connect your Stellar wallet via the Freighter browser extension</p>
      </header>

      <ErrorBoundary componentName="Wallet Connection">
        <Card title="Connection" ariaLabel="Wallet connection status">
          <div className="settings-section">
            <div className="wallet-status-row">
              <span
                className={`status-badge status-${
                  status === "connected" ? "active" : "pending"
                }`}
              >
                {STATUS_LABEL[status] ?? status}
              </span>
            </div>

            {status === "connected" && address && (
              <dl className="wallet-detail-list">
                <div className="wallet-detail-row">
                  <dt>Address</dt>
                  <dd style={{ fontFamily: "monospace" }}>{address}</dd>
                </div>
                <div className="wallet-detail-row">
                  <dt>Network</dt>
                  <dd>{network ?? "Unknown"}</dd>
                </div>
                {networkPassphrase && (
                  <div className="wallet-detail-row">
                    <dt>Passphrase</dt>
                    <dd style={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>
                      {networkPassphrase}
                    </dd>
                  </div>
                )}
              </dl>
            )}

            {status !== "connected" && error && (
              <p className="settings-status error" role="alert">
                {error}
              </p>
            )}

            {status === "unavailable" && (
              <p className="settings-toggle-hint">
                Install the{" "}
                <a href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer">
                  Freighter wallet extension
                </a>{" "}
                to connect your Stellar account to Delego.
              </p>
            )}

            <div className="form-actions">
              <WalletConnectButton showDetails={false} />
            </div>
          </div>
        </Card>
      </ErrorBoundary>

      <ErrorBoundary componentName="Soroban Permissions Info">
        <Card title="About Soroban Permissions">
          <p>
            Once connected, your wallet address is used to grant scoped spending
            permissions to AI agents. Delego never has access to your private
            key — every transaction is signed locally in the Freighter
            extension before it is submitted to Stellar.
          </p>
        </Card>
      </ErrorBoundary>
    </div>
  );
}
