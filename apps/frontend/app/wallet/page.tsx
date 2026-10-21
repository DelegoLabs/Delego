"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card } from "@delegolabs/ui";
import { PasskeyRegisterModal } from "../../components/wallet/PasskeyRegisterModal";
import { FriendbotModal } from "../../components/wallet/FriendbotModal";
import { useWallet } from "../../hooks/useWallet";
import { useNetwork } from "../../hooks/useNetwork";
import { useNotifications } from "../../hooks/useNotifications";
import { useBalanceHistory } from "../../hooks/useBalanceHistory";
import { usePaymentStream } from "../../hooks/usePaymentStream";
import { useAudioNotifications } from "../../hooks/useAudioNotifications";
import { useFriendbot } from "../../hooks/useFriendbot";
import { WalletConnectButton } from "../../components/wallet/WalletConnectButton";
import { FeeTierField } from "../../components/wallet/FeeTierField";
import { BalanceSparkline } from "../../components/wallet/BalanceSparkline";
import { AssetBreakdownTable } from "../../components/wallet/AssetBreakdownTable";
import { CopyButton } from "../../components/wallet/CopyButton";
import { TokenAllowancesCard } from "../../components/wallet/TokenAllowancesCard";
import { HydrationStableBalance } from "../../components/HydrationStableBalance";
import {
  useDemoModeGuard,
  DEMO_MODE_BLOCKED_MESSAGE,
} from "../../hooks/useDemoModeGuard";
import {
  useOnlineStatus,
  OFFLINE_BLOCKED_MESSAGE,
} from "../../hooks/useOnlineStatus";

const STATUS_LABEL: Record<string, string> = {
  checking: "Checking for Freighter…",
  unavailable: "Freighter extension not detected",
  disconnected: "Not connected",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Connection error",
};

export default function WalletPage() {
  const { status, address, network, networkPassphrase, error, toast } = useWallet();
  const { network: activeNetwork } = useNetwork();
  const notifications = useNotifications();
  const [passkeyOpen, setPasskeyOpen] = useState(false);
  const [friendbotOpen, setFriendbotOpen] = useState(false);
  const { isDemoMode } = useDemoModeGuard();
  const { connectionStatus } = useOnlineStatus();
  const { playChime } = useAudioNotifications();

  const isConnected = status === "connected" && !!address;
  const balanceState = useBalanceHistory(
    address,
    activeNetwork.horizonUrl,
    isConnected
  );
  const refetchBalance = balanceState.refetch;
  const addNotification = notifications.add;
  const paymentStream = usePaymentStream(
    address,
    activeNetwork.horizonUrl,
    isConnected
  );
  const lastNotifiedPaymentId = useRef<string | null>(null);

  useEffect(() => {
    const payment = paymentStream.latestPayment;
    if (!payment || lastNotifiedPaymentId.current === payment.id) return;

    lastNotifiedPaymentId.current = payment.id;
    void refetchBalance();
    addNotification({
      type: "success",
      title: `Payment received: ${payment.amount} ${payment.assetCode}`,
      message: `Sent from ${payment.from}.`,
      href: "/wallet",
    });
    playChime();
  }, [
    addNotification,
    paymentStream.latestPayment,
    playChime,
    refetchBalance,
  ]);

  const nativeBalance = balanceState.balances.find(
    (b) => b?.asset_type === "native"
  );
  const nativeBalanceNum =
    nativeBalance?.balance ? parseFloat(nativeBalance.balance) : 0;

  // -------------------------------------------------------------------------
  // Friendbot
  // -------------------------------------------------------------------------
  const { state: friendbotState, fund, initForAddress } = useFriendbot();

  // Restore any in-progress cooldown when the connected address changes.
  useEffect(() => {
    if (address) initForAddress(address);
  }, [address, initForAddress]);

  // Trigger balance refresh as soon as Friendbot confirms ledger inclusion.
  useEffect(() => {
    if (friendbotState.status === "success") {
      void balanceState.refetch();
      notifications.add({
        type: "success",
        title: "Testnet account funded",
        message: "Friendbot sent 10,000 XLM to your connected wallet.",
      });
    }
  }, [friendbotState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFund = useCallback(async () => {
    if (!address || isDemoMode || connectionStatus !== "online") return;
    await fund(address);
  }, [address, fund, isDemoMode, connectionStatus]);

  const openFriendbotModal = useCallback(() => {
    setFriendbotOpen(true);
  }, []);

  const closeFriendbotModal = useCallback(() => {
    setFriendbotOpen(false);
  }, []);

  // -------------------------------------------------------------------------
  // Zero-state visibility
  // -------------------------------------------------------------------------
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
        <p>Connect your Stellar wallet via the Freighter browser extension</p>
      </header>

      {paymentStream.latestPayment && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginBottom: "1rem",
            padding: "0.875rem 1rem",
            border: "1px solid var(--color-success-border)",
            borderRadius: "0.5rem",
            background: "var(--color-success-bg)",
            color: "var(--color-success-text)",
          }}
        >
          Received {paymentStream.latestPayment.amount}{" "}
          {paymentStream.latestPayment.assetCode} from{" "}
          {paymentStream.latestPayment.from}.
        </div>
      )}
      {paymentStream.status === "reconnecting" && (
        <p role="status" className="settings-toggle-hint">
          {paymentStream.error}
        </p>
      )}

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
                    <HydrationStableBalance
                      stroopAmount={BigInt(
                        Math.round(nativeBalanceNum * 10_000_000)
                      )}
                    />
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

          {toast && (
            <p className="wallet-notice" role="status" aria-live="polite">
              {toast}
            </p>
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
                href="https://www.freighter.app/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Freighter wallet extension
              </a>{" "}
              to connect your Stellar account to Delego.
            </p>
          )}

          <div className="form-actions">
            <WalletConnectButton showDetails={false} />
            {isConnected && (
              <Button
                variant="secondary"
                type="button"
                onClick={() => setPasskeyOpen(true)}
              >
                Register passkey
              </Button>
            )}
          </div>
          <PasskeyRegisterModal
            isOpen={passkeyOpen}
            stellarAddress={address ?? ""}
            onClose={() => setPasskeyOpen(false)}
            onSuccess={() => {
              setPasskeyOpen(false);
              notifications.add({
                type: "success",
                title: "Passkey registered",
                message:
                  "This device can approve agent transactions without a browser-extension prompt.",
              });
            }}
          />
        </div>
      </Card>

      <FeeTierField />

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

                {/* Zero-state card with Friendbot modal trigger */}
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
                        balance yet. Use the Friendbot testnet faucet to fund
                        it with free testnet tokens.
                      </p>
                      {friendbotState.cooldownSecondsRemaining > 0 && (
                        <p
                          className="settings-status"
                          style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}
                        >
                          Next request in{" "}
                          <strong>
                            {friendbotState.cooldownSecondsRemaining}s
                          </strong>
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="friendbot-button"
                      onClick={openFriendbotModal}
                      disabled={isDemoMode || connectionStatus !== "online"}
                      title={
                        connectionStatus !== "online"
                          ? OFFLINE_BLOCKED_MESSAGE
                          : isDemoMode
                            ? DEMO_MODE_BLOCKED_MESSAGE
                            : undefined
                      }
                    >
                      Fund your account
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      )}

      <TokenAllowancesCard
        address={address}
        isConnected={isConnected}
        disabled={isDemoMode || connectionStatus !== "online"}
      />

      <Card title="About Soroban Permissions">
        <p>
          Once connected, your wallet address is used to grant scoped spending
          permissions to AI agents. Delego never has access to your private key
          — every transaction is signed locally in the Freighter extension
          before it is submitted to Stellar.
        </p>
      </Card>

      {/* Friendbot funding modal */}
      <FriendbotModal
        isOpen={friendbotOpen}
        address={address ?? ""}
        state={friendbotState}
        onFund={() => void handleFund()}
        onClose={closeFriendbotModal}
      />
    </div>
  );
}
