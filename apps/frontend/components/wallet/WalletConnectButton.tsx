"use client";

import { Button } from "@delego/ui";
import { useWallet } from "../../hooks/useWallet";

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export interface WalletConnectButtonProps {
  /** Show the connected address and network alongside the button (default: true) */
  showDetails?: boolean;
}

/**
 * Connect/disconnect control for the Freighter browser wallet.
 * Reusable in the header, dashboard, and the dedicated wallet page.
 */
export function WalletConnectButton({
  showDetails = true,
}: WalletConnectButtonProps) {
  const { status, address, network, error, connect, disconnect } =
    useWallet();

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
          window.open("https://www.freighter.app/", "_blank", "noopener,noreferrer")
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
            {network && (
              <span className="wallet-network-badge">{network}</span>
            )}
            {truncateAddress(address)}
          </span>
        )}
        <Button variant="ghost" onClick={disconnect}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <Button
        variant="primary"
        onClick={connect}
        disabled={status === "connecting"}
      >
        {status === "connecting" ? "Connecting…" : "Connect Wallet"}
      </Button>
      {status === "error" && error && (
        <span className="wallet-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
