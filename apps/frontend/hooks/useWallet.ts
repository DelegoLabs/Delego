"use client";

import { useCallback, useEffect, useState } from "react";

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

const initialState: WalletState = {
  status: "checking",
  address: null,
  network: null,
  networkPassphrase: null,
  error: null,
};

/**
 * Connects to the Freighter browser extension via `@stellar/freighter-api`.
 * Freighter only exists in the browser, so the SDK is dynamically imported
 * the same way the QR code library is lazy-loaded in DelegationQR.
 */
export function useWallet() {
  const [state, setState] = useState<WalletState>(initialState);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "checking", error: null }));
    try {
      const freighter = await import("@stellar/freighter-api");

      const connected = await freighter.isConnected();
      if (connected.error || !connected.isConnected) {
        setState({ ...initialState, status: "unavailable" });
        return;
      }

      const allowed = await freighter.isAllowed();
      if (allowed.error || !allowed.isAllowed) {
        setState({ ...initialState, status: "disconnected" });
        return;
      }

      const addressRes = await freighter.getAddress();
      if (addressRes.error || !addressRes.address) {
        setState({
          ...initialState,
          status: "error",
          error: addressRes.error?.message ?? "Could not read wallet address",
        });
        return;
      }

      const net = await freighter.getNetwork();
      setState({
        status: "connected",
        address: addressRes.address,
        network: net.error ? null : net.network,
        networkPassphrase: net.error ? null : net.networkPassphrase,
        error: null,
      });
    } catch (err) {
      setState({
        ...initialState,
        status: "unavailable",
        error:
          err instanceof Error
            ? err.message
            : "Freighter extension not detected",
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "connecting", error: null }));
    try {
      const freighter = await import("@stellar/freighter-api");
      const access = await freighter.requestAccess();
      if (access.error || !access.address) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: access.error?.message ?? "Wallet access was denied",
        }));
        return;
      }

      const net = await freighter.getNetwork();
      setState({
        status: "connected",
        address: access.address,
        network: net.error ? null : net.network,
        networkPassphrase: net.error ? null : net.networkPassphrase,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "unavailable",
        error:
          err instanceof Error
            ? err.message
            : "Freighter extension not found. Install it to connect your wallet.",
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ ...initialState, status: "disconnected" });
  }, []);

  return {
    ...state,
    isConnected: state.status === "connected",
    connect,
    disconnect,
    refresh,
  };
}
