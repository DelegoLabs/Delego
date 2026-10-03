"use client";

import { useState } from "react";
import { Button } from "@delegolabs/ui";
import { useWallet } from "../../hooks/useWallet";
import { WalletSelectorModal } from "./WalletSelectorModal";
import type { SupportedWallet } from "../../lib/wallets";

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export interface WalletConnectButtonProps {
  /** Show the connected address and network alongside the button (default: true) */
  showDetails?: boolean;
}

/**
 * Connect/disconnect control for Stellar wallets.
 * Opens the wallet selector for switching between supported wallets.
 * Reusable in the header, dashboard, and the dedicated wallet page.
 */
export function WalletConnectButton({
  showDetails = true,
}: WalletConnectButtonProps) {
  const {
    status,
    address,
    network,
    error,
    connect,
    disconnect,
    walletId,
    walletOptions,
    selectWallet,
  } = useWallet();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [pendingId, setPendingId] = useState<SupportedWallet | null>(null);

  const openSelector = () => setSelectorOpen(true);

  const handleConnect = async (id: SupportedWallet) => {
    setPendingId(id);
    try {
      await connect(id);
    } finally {
      setPendingId(null);
    }
  };

  const switchWalletButton = (
    <Button variant="ghost" onClick={openSelector}>
      Switch wallet
    </Button>
  );

  if (status === "checking") {
    return (
      <Button variant="secondary" disabled>
        Checking wallet…
      </Button>
    );
  }

  if (status === "unavailable") {
    return (
      <Button
        variant="secondary"
        onClick={() =>
          window.open(
            "https://www.freighter.app/",
            "_blank",
            "noopener,noreferrer"
          )
        }
      >
        Install Freighter
      </Button>
    );
  }

  if (status === "connected" && address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {showDetails && (
          <span
            className="wallet-address"
            title={address}
            aria-label={`Connected wallet ${address}`}
          >
            {network && <span className="wallet-network-badge">{network}</span>}
            {truncateAddress(address)}
          </span>
        )}
        <Button variant="ghost" onClick={disconnect}>
          Disconnect
        </Button>
        {switchWalletButton}
        <WalletSelectorModal
          open={selectorOpen}
          options={walletOptions}
          activeId={walletId}
          pendingId={pendingId}
          onSelect={(id) => {
            selectWallet(id);
          }}
          onConnect={(id) => {
            void handleConnect(id);
          }}
          onClose={() => setSelectorOpen(false)}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <Button
        variant="primary"
        onClick={() => void connect()}
        disabled={status === "connecting"}
      >
        {status === "connecting" ? "Connecting…" : "Connect Wallet"}
      </Button>
      {switchWalletButton}
      <WalletSelectorModal
        open={selectorOpen}
        options={walletOptions}
        activeId={walletId}
        pendingId={pendingId}
        onSelect={(id) => {
          selectWallet(id);
        }}
        onConnect={(id) => {
          void handleConnect(id);
        }}
        onClose={() => setSelectorOpen(false)}
      />
      {status === "error" && error && (
        <span className="wallet-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
