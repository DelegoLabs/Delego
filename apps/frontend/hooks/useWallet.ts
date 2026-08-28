"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isDemoMode,
  DEMO_WALLET_ADDRESS,
  DEMO_NETWORK,
  DEMO_NETWORK_PASSPHRASE,
} from "../lib/demoMode";
import { WalletAccessDeniedError } from "../lib/wallet/types";
import type { StellarWalletAdapter } from "../lib/wallet/types";
import {
  defaultWalletAdapter,
  getStoredWalletAdapterId,
  getWalletAdapter,
  storeWalletAdapterId,
} from "../lib/wallet/registry";

export type WalletConnectionStatus =
  | "checking"
  | "unavailable"
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface WalletState {
  status: WalletConnectionStatus;
  address: string | null;
  network: string | null;
  networkPassphrase: string | null;
  error: string | null;
}

interface ActiveWalletMeta {
  id: string;
  name: string;
  installUrl: string;
}

const initialState: WalletState = {
  status: "checking",
  address: null,
  network: null,
  networkPassphrase: null,
  error: null,
};

/** Synthetic connected-wallet state reported while demo mode is active (#632). */
const demoState: WalletState = {
  status: "connected",
  address: DEMO_WALLET_ADDRESS,
  network: DEMO_NETWORK,
  networkPassphrase: DEMO_NETWORK_PASSPHRASE,
  error: null,
};

function metaOf(adapter: StellarWalletAdapter): ActiveWalletMeta {
  return {
    id: adapter.id,
    name: adapter.name,
    installUrl: adapter.installUrl,
  };
}

/**
 * Wallet connection state machine, driven entirely through the
 * StellarWalletAdapter registry (lib/wallet). The selected wallet is
 * persisted per browser; with nothing stored it behaves exactly as the
 * previous Freighter-only hook did.
 */
export function useWallet() {
  const [state, setState] = useState<WalletState>(
    isDemoMode() ? demoState : initialState
  );
  const [activeWallet, setActiveWallet] = useState<ActiveWalletMeta>(
    metaOf(defaultWalletAdapter)
  );

  const probe = useCallback(async (adapter: StellarWalletAdapter) => {
    setActiveWallet(metaOf(adapter));
    setState((prev) => ({ ...prev, status: "checking", error: null }));

    let present: boolean;
    try {
      present = await adapter.detect();
    } catch (err) {
      setState({
        ...initialState,
        status: "unavailable",
        error:
          err instanceof Error
            ? err.message
            : `${adapter.name} extension not detected`,
      });
      return;
    }
    if (!present) {
      setState({ ...initialState, status: "unavailable" });
      return;
    }

    try {
      const address = await adapter.getAddress();
      if (address === null) {
        setState({ ...initialState, status: "disconnected" });
        return;
      }
      const net = await adapter.getNetwork();
      setState({
        status: "connected",
        address,
        network: net.network,
        networkPassphrase: net.networkPassphrase,
        error: null,
      });
    } catch (err) {
      setState({
        ...initialState,
        status: "error",
        error:
          err instanceof Error
            ? err.message
            : "Couldn't read the wallet address. Please try again.",
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    if (isDemoMode()) {
      setState(demoState);
      return;
    }
    await probe(getWalletAdapter(getStoredWalletAdapterId()));
  }, [probe]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Connect through a specific wallet and persist it as the browser's choice. */
  const connectWith = useCallback(async (adapterId: string) => {
    if (isDemoMode()) {
      setState(demoState);
      return;
    }
    const adapter = getWalletAdapter(adapterId);
    setActiveWallet(metaOf(adapter));
    setState((prev) => ({ ...prev, status: "connecting", error: null }));
    try {
      const address = await adapter.connect();
      storeWalletAdapterId(adapter.id);
      const net = await adapter.getNetwork();
      setState({
        status: "connected",
        address,
        network: net.network,
        networkPassphrase: net.networkPassphrase,
        error: null,
      });
    } catch (err) {
      if (err instanceof WalletAccessDeniedError) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: err.message,
        }));
        return;
      }
      setState((prev) => ({
        ...prev,
        status: "unavailable",
        error:
          err instanceof Error
            ? err.message
            : `${adapter.name} extension not found. Install it to connect your wallet.`,
      }));
    }
  }, []);

  /** Connect with the persisted wallet choice (Freighter when none stored). */
  const connect = useCallback(async () => {
    await connectWith(getWalletAdapter(getStoredWalletAdapterId()).id);
  }, [connectWith]);

  const disconnect = useCallback(() => {
    void getWalletAdapter(getStoredWalletAdapterId()).disconnect();
    setState({ ...initialState, status: "disconnected" });
  }, []);

  return {
    ...state,
    isConnected: state.status === "connected",
    walletId: activeWallet.id,
    walletName: activeWallet.name,
    walletInstallUrl: activeWallet.installUrl,
    connect,
    connectWith,
    disconnect,
    refresh,
  };
}
