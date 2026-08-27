"use client";

import { useCallback, useState } from "react";
import { Button } from "@delegolabs/ui";
import { useWallet } from "../../hooks/useWallet";
import {
  detectWalletAdapter,
  detectWalletAdapters,
  getStoredWalletAdapterId,
  getWalletAdapter,
} from "../../lib/wallet/registry";
import { WalletPickerModal, type WalletPickerRow } from "./WalletPickerModal";

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export interface WalletConnectButtonProps {
  /** Show the connected address and network alongside the button (default: true) */
  showDetails?: boolean;
}

/**
 * Connect/disconnect control for the supported browser wallets.
 * Reusable in the header, dashboard, and the dedicated wallet page.
 *
 * A persisted wallet choice that is still installed connects directly, as
 * does the only installed wallet — both match the old Freighter-only flow.
 * Otherwise the picker opens with the detection results, so the user can
 * choose or install one.
 */
export function WalletConnectButton({
  showDetails = true,
}: WalletConnectButtonProps) {
  const {
    status,
    address,
    network,
    error,
    walletName,
    walletInstallUrl,
    connectWith,
    disconnect,
  } = useWallet();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRows, setPickerRows] = useState<WalletPickerRow[] | undefined>(
    undefined
  );
  const [detecting, setDetecting] = useState(false);

  const openConnect = useCallback(async () => {
    setDetecting(true);
    try {
      const storedId = getStoredWalletAdapterId();
      if (storedId) {
        const stored = getWalletAdapter(storedId);
        if (await detectWalletAdapter(stored)) {
          await connectWith(stored.id);
          return;
        }
      }

      const results = await detectWalletAdapters();
      const rows = results.map(({ adapter, detected }) => ({
        id: adapter.id,
        name: adapter.name,
        installUrl: adapter.installUrl,
        detected,
      }));
      const available = rows.filter((row) => row.detected);
      if (available.length === 1) {
        await connectWith(available[0].id);
        return;
      }
      setPickerRows(rows);
      setPickerOpen(true);
    } finally {
      setDetecting(false);
    }
  }, [connectWith]);

  const selectWallet = useCallback(
    (adapterId: string) => {
      setPickerOpen(false);
      void connectWith(adapterId);
    },
    [connectWith]
  );

  if (status === "checking") {
    return (
      <Button variant="secondary" disabled>
        Checking wallet…
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
      </div>
    );
  }

  const busy = status === "connecting" || detecting;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <Button variant="primary" onClick={openConnect} disabled={busy}>
        {busy ? "Connecting…" : "Connect Wallet"}
      </Button>
      {status === "unavailable" && (
        <a
          href={walletInstallUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: "0.875rem" }}
        >
          Install {walletName}
        </a>
      )}
      {status === "error" && error && (
        <span className="wallet-error" role="alert">
          {error}
        </span>
      )}
      <WalletPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={selectWallet}
        adapters={pickerRows}
      />
    </div>
  );
}
