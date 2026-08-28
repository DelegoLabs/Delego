"use client";

import { useCallback, useState } from "react";
import { Card } from "@delegolabs/ui";
import { useWallet } from "../../hooks/useWallet";
import { useNetwork } from "../../hooks/useNetwork";
import { useNotifications } from "../../hooks/useNotifications";
import { useBalanceHistory } from "../../hooks/useBalanceHistory";
import { WalletConnectButton } from "../../components/wallet/WalletConnectButton";
import { BalanceSparkline } from "../../components/wallet/BalanceSparkline";
import { AssetBreakdownTable } from "../../components/wallet/AssetBreakdownTable";
import { CopyButton } from "../../components/wallet/CopyButton";
import {
  useDemoModeGuard,
  DEMO_MODE_BLOCKED_MESSAGE,
} from "../../hooks/useDemoModeGuard";
import { walletAdapters } from "../../lib/wallet/registry";

function statusLabel(status: string, walletName: string): string {
  const labels: Record<string, string> = {
    checking: `Checking for ${walletName}…`,
    unavailable: `${walletName} extension not detected`,
    disconnected: "Not connected",
    connecting: "Connecting…",
    connected: "Connected",
    error: "Connection error",
  };
  return labels[status] ?? status;
}

export default function WalletPage() {
  const {
    status,
    address,
    network,
    networkPassphrase,
    error,
    walletName,
    walletInstallUrl,
  } = useWallet();
  const { network: activeNetwork } = useNetwork();
  const notifications = useNotifications();
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const { isDemoMode } = useDemoModeGuard();

  const isConnected = status === "connected" && !!address;
  const balanceState = useBalanceHistory(
    address,
    activeNetwork.horizonUrl,
    isConnected
  );

  const nativeBalance = balanceState.balances.find(
    (b) => b.asset_type === "native"
  );
  const nativeBalanceNum = nativeBalance
    ? parseFloat(nativeBalance.balance)
    : 0;

  const fundAccount = useCallback(async () => {
    if (!address || funding || isDemoMode) return;

    setFunding(true);
    setFundError(null);
    try {
      const response = await fetch(
        `https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`
      );

      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? "Friendbot is rate limiting this account. Please wait a minute and try again."
            : "Friendbot could not fund this account. Please try again."
        );
      }

      notifications.add({
        type: "success",
        title: "Testnet account funded",
        message: "Friendbot sent test XLM to your connected wallet.",
      });
      void balanceState.refetch();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Friendbot could not fund this account. Please try again.";
      setFundError(message);
      notifications.add({ type: "error", title: "Funding failed", message });
    } finally {
      setFunding(false);
    }
  }, [address, funding, isDemoMode, notifications, balanceState]);

  const showZeroState =
    isConnected &&
    !activeNetwork.isLive &&
    balanceState.status !== "loading" &&
    (balanceState.accountNotFound ||
      balanceState.isUnfunded ||
      nativeBalanceNum === 0);

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Wallet</h1>
        <p>
          Connect your Stellar wallet via the{" "}
          {walletAdapters.map((adapter) => adapter.name).join(" or ")} browser
          extension
        </p>
      </header>

      <Card title="Connection" ariaLabel="Wallet connection status">
        <div className="settings-section">
          <div className="wallet-status-row">
            <span
              className={`status-badge status-${
                status === "connected" ? "active" : "pending"
              }`}
            >
              {statusLabel(status, walletName)}
            </span>
          </div>

          {status === "connected" && address && (
            <dl className="wallet-detail-list">
              <div className="wallet-detail-row">
                <dt>Address</dt>
                <dd
                  style={{
                    fontFamily: "monospace",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {address}
                  <CopyButton value={address} label="Copy wallet address">
                    Copy
                  </CopyButton>
                </dd>
              </div>
              <div className="wallet-detail-row">
                <dt>Network</dt>
                <dd>{network ?? "Unknown"}</dd>
              </div>
              {nativeBalance !== undefined && (
                <div className="wallet-detail-row">
                  <dt>Current XLM Balance</dt>
                  <dd>
                    {nativeBalanceNum.toLocaleString(undefined, {
                      maximumFractionDigits: 7,
                    })}{" "}
                    XLM
                  </dd>
                </div>
              )}
              {networkPassphrase && (
                <div className="wallet-detail-row">
                  <dt>Passphrase</dt>
                  <dd
                    style={{ fontFamily: "monospace", fontSize: "0.8125rem" }}
                  >
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
              <a
                href={walletInstallUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {walletName} wallet extension
              </a>{" "}
              to connect your Stellar account to Delego.
            </p>
          )}

          <div className="form-actions">
            <WalletConnectButton showDetails={false} />
          </div>
        </div>
      </Card>

      {/* Historical View & Asset Breakdown Card */}
      {isConnected && (
        <Card
          title="Balance History & Asset Breakdown"
          ariaLabel="Balance History and Assets"
        >
          <div className="wallet-balance-card">
            {balanceState.status === "loading" ? (
              <div className="skeleton-form">
                <div className="skeleton-title" style={{ width: "40%" }} />
                <div className="skeleton-input" style={{ height: "120px" }} />
                <div className="skeleton-text" />
              </div>
            ) : balanceState.status === "error" ? (
              <p className="settings-status error" role="alert">
                Could not load account balance and history from Horizon.
              </p>
            ) : (
              <>
                <BalanceSparkline series={balanceState.series} />

                {balanceState.balances.length > 0 ? (
                  <div style={{ marginTop: "1.5rem" }}>
                    <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>
                      Holdings
                    </h3>
                    <AssetBreakdownTable
                      balances={balanceState.balances}
                      horizonUrl={activeNetwork.horizonUrl}
                      isLiveNetwork={activeNetwork.isLive}
                    />
                  </div>
                ) : null}

                {/* Inviting zero state card linking to testnet faucet */}
                {showZeroState && (
                  <div
                    className="friendbot-card wallet-zero-state"
                    role="status"
                    style={{ marginTop: "1.5rem" }}
                  >
                    <div>
                      <h2>Fund your testnet account</h2>
                      <p>
                        This connected account does not have an active XLM
                        balance yet. Use the Friendbot testnet faucet to fund it
                        with free testnet tokens.
                      </p>
                      {fundError && (
                        <p
                          className="settings-status error"
                          style={{ marginTop: "0.5rem" }}
                        >
                          {fundError}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="friendbot-button"
                      onClick={fundAccount}
                      disabled={funding || isDemoMode}
                      title={isDemoMode ? DEMO_MODE_BLOCKED_MESSAGE : undefined}
                    >
                      {funding ? "Funding…" : "Fund your account"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      )}

      <Card title="About Soroban Permissions">
        <p>
          Once connected, your wallet address is used to grant scoped spending
          permissions to AI agents. Delego never has access to your private key
          — every transaction is signed locally in your wallet extension
          before it is submitted to Stellar.
        </p>
      </Card>
    </div>
  );
}
