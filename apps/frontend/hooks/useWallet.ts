"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isDemoMode,
  DEMO_WALLET_ADDRESS,
  DEMO_NETWORK,
  DEMO_NETWORK_PASSPHRASE,
} from "../lib/demoMode";
import { useNotifications } from "./useNotifications";
import { useAnnounce } from "./useAnnounce";
import {
  WALLET_CANCELLED_MESSAGE,
  isUserDeclined,
} from "../services/wallet";
import {
  clearPersistedWalletId,
  detectInstalledWallets,
  getPersistedWalletId,
  setPersistedWalletId,
  type SupportedWallet,
  type WalletOption,
} from "../lib/wallets";

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

/** Synthetic connected-wallet state reported while demo mode is active (#632). */
const demoState: WalletState = {
  status: "connected",
  address: DEMO_WALLET_ADDRESS,
  network: DEMO_NETWORK,
  networkPassphrase: DEMO_NETWORK_PASSPHRASE,
  error: null,
};

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Multi-wallet connection state (issue #774), defaulting to the Freighter
 * browser extension via `@stellar/freighter-api`.
 * Freighter only exists in the browser, so the SDK is dynamically imported
 * the same way the QR code library is lazy-loaded in DelegationQR.
 */
export function useWallet() {
  const [state, setState] = useState<WalletState>(
    isDemoMode() ? demoState : initialState
  );
  const [toast, setToast] = useState<string | null>(null);
  const prevAddressRef = useRef<string | null>(null);

  let announceFn: ((msg: string) => void) | undefined;
  try {
    const announceCtx = useAnnounce();
    if (announceCtx?.announce) {
      announceFn = announceCtx.announce;
    }
  } catch {
    /* ignore if outside AnnounceProvider */
  }

  let addNotificationFn:
    | ((notification: { type: "info"; title: string }) => void)
    | undefined;
  try {
    const notifCtx = useNotifications();
    if (notifCtx?.add) {
      addNotificationFn = notifCtx.add;
    }
  } catch {
    /* ignore if outside NotificationProvider */
  }

  const announceRef = useRef(announceFn);
  announceRef.current = announceFn;

  const addNotificationRef = useRef(addNotificationFn);
  addNotificationRef.current = addNotificationFn;

  // Issue #774: the active wallet choice. Initialized from the persisted
  // session (survives page navigation); defaults to Freighter, preserving
  // the pre-existing single-wallet behavior for existing callers.
  const [walletId, setWalletId] = useState<SupportedWallet>(
    () => getPersistedWalletId() ?? "freighter"
  );

  const updateWalletState = useCallback(
    (newState: WalletState) => {
      const prevAddr = prevAddressRef.current;
      const newAddr = newState.address;

      if (
        prevAddr !== null &&
        newAddr !== null &&
        prevAddr !== newAddr &&
        newState.status === "connected"
      ) {
        const msg = `Switched to ${truncateAddress(newAddr)}`;
        setToast(msg);
        addNotificationRef.current?.({ type: "info", title: msg });
        announceRef.current?.(msg);
      }

      prevAddressRef.current = newAddr;
      setState(newState);
    },
    []
  );

  const refresh = useCallback(async () => {
    if (isDemoMode()) {
      setState(demoState);
      return null;
    }
    setState((prev) => ({ ...prev, status: "checking", error: null }));
    try {
      const freighter = await import("@stellar/freighter-api");

      const connected = await freighter.isConnected();
      if (connected.error || !connected.isConnected) {
        updateWalletState({ ...initialState, status: "unavailable" });
        return freighter;
      }

      const allowed = await freighter.isAllowed();
      if (allowed.error || !allowed.isAllowed) {
        updateWalletState({ ...initialState, status: "disconnected" });
        return freighter;
      }

      const addressRes = await freighter.getAddress();
      if (addressRes.error || !addressRes.address) {
        updateWalletState({
          ...initialState,
          status: "error",
          error:
            addressRes.error?.message ??
            "Couldn't read the wallet address. Please try again.",
        });
        return freighter;
      }

      const net = await freighter.getNetwork();
      updateWalletState({
        status: "connected",
        address: addressRes.address,
        network: net.error ? null : net.network,
        networkPassphrase: net.error ? null : net.networkPassphrase,
        error: null,
      });
      return freighter;
    } catch (err) {
      updateWalletState({
        ...initialState,
        status: "unavailable",
        error:
          err instanceof Error
            ? err.message
            : "Freighter extension not detected",
      });
      return null;
    }
  }, [updateWalletState]);

  useEffect(() => {
    if (isDemoMode()) {
      setState(demoState);
      return;
    }

    let isMounted = true;
    let unsubAccount: (() => void) | undefined;
    let unsubNetwork: (() => void) | undefined;

    void refresh().then((freighter) => {
      if (!isMounted || !freighter) return;

      const fAny = freighter as Record<string, unknown>;
      const fDefault =
        "default" in fAny && fAny.default && typeof fAny.default === "object"
          ? (fAny.default as Record<string, unknown>)
          : undefined;

      const onAccountChange = (fAny.onAccountChange ??
        fDefault?.onAccountChange ??
        fAny.getAccountChangeHandler ??
        fDefault?.getAccountChangeHandler) as
        | ((cb: (addr: string) => void) => (() => void) | { remove: () => void })
        | undefined;

      const onNetworkChange = (fAny.onNetworkChange ??
        fDefault?.onNetworkChange ??
        fAny.getNetworkChangeHandler ??
        fDefault?.getNetworkChangeHandler) as
        | ((cb: (net: string) => void) => (() => void) | { remove: () => void })
        | undefined;

      const watchWalletChanges = (fAny.WatchWalletChanges ??
        fDefault?.WatchWalletChanges) as
        | ((cb: (state: unknown) => void) => (() => void) | { remove: () => void })
        | undefined;

      if (typeof onAccountChange === "function") {
        const res = onAccountChange(() => {
          if (isMounted) void refresh();
        });
        if (typeof res === "function") {
          unsubAccount = res;
        } else if (
          res &&
          typeof (res as { remove?: () => void }).remove === "function"
        ) {
          unsubAccount = () => (res as { remove: () => void }).remove();
        }
      }

      if (typeof onNetworkChange === "function") {
        const res = onNetworkChange(() => {
          if (isMounted) void refresh();
        });
        if (typeof res === "function") {
          unsubNetwork = res;
        } else if (
          res &&
          typeof (res as { remove?: () => void }).remove === "function"
        ) {
          unsubNetwork = () => (res as { remove: () => void }).remove();
        }
      }

      if (
        !unsubAccount &&
        !unsubNetwork &&
        typeof watchWalletChanges === "function"
      ) {
        const res = watchWalletChanges(() => {
          if (isMounted) void refresh();
        });
        if (typeof res === "function") {
          unsubAccount = res;
        } else if (
          res &&
          typeof (res as { remove?: () => void }).remove === "function"
        ) {
          unsubAccount = () => (res as { remove: () => void }).remove();
        }
      }
    });

    return () => {
      isMounted = false;
      if (unsubAccount) unsubAccount();
      if (unsubNetwork) unsubNetwork();
    };
  }, [refresh]);

  const connect = useCallback(
    async (id?: SupportedWallet) => {
      const target = id ?? walletId;
      if (isDemoMode()) {
        setWalletId(target);
        setPersistedWalletId(target);
        setState(demoState);
        return;
      }
      // Non-extension wallets connect outside this client (redirect/QR
      // handshake owned by follow-up work); record the choice and surface a
      // precise status instead of failing against the Freighter-only path.
      if (target !== "freighter") {
        const options = detectInstalledWallets();
        const option = options.find((o) => o.id === target);
        setWalletId(target);
        setPersistedWalletId(target);
        setState((prev) => ({
          ...prev,
          status: "unavailable",
          error:
            option !== undefined && !option.isInstalled
              ? `${option.name} was not detected. Install it (or approve on your device) and try again.`
              : `Connect with ${option?.name ?? target} via its own approval flow, then retry.`,
        }));
        return;
      }
      setWalletId("freighter");
      setPersistedWalletId("freighter");
      setState((prev) => ({ ...prev, status: "connecting", error: null }));
      try {
        const freighter = await import("@stellar/freighter-api");
        const access = await freighter.requestAccess();
        if (access.error || !access.address) {
          if (isUserDeclined(access.error)) {
            updateWalletState({ ...initialState, status: "disconnected" });
            setToast(WALLET_CANCELLED_MESSAGE);
            announceRef.current?.(WALLET_CANCELLED_MESSAGE);
            return;
          }
          setState((prev) => ({
            ...prev,
            status: "error",
            error: access.error?.message ?? "Wallet access was denied",
          }));
          return;
        }

        const net = await freighter.getNetwork();
        updateWalletState({
          status: "connected",
          address: access.address,
          network: net.error ? null : net.network,
          networkPassphrase: net.error ? null : net.networkPassphrase,
          error: null,
        });
      } catch (err) {
        if (isUserDeclined(err)) {
          updateWalletState({ ...initialState, status: "disconnected" });
          setToast(WALLET_CANCELLED_MESSAGE);
          announceRef.current?.(WALLET_CANCELLED_MESSAGE);
          return;
        }
        setState((prev) => ({
          ...prev,
          status: "unavailable",
          error:
            err instanceof Error
              ? err.message
              : "Freighter extension not found. Install it to connect your wallet.",
        }));
      }
    },
    [updateWalletState, walletId]
  );

  const selectWallet = useCallback((id: SupportedWallet) => {
    setWalletId(id);
    setPersistedWalletId(id);
    setState({ ...initialState, status: "disconnected" });
  }, []);

  const disconnect = useCallback(() => {
    prevAddressRef.current = null;
    clearPersistedWalletId();
    setState({ ...initialState, status: "disconnected" });
  }, []);

  const walletOptions: WalletOption[] = detectInstalledWallets();

  return {
    ...state,
    isConnected: state.status === "connected",
    walletId,
    walletOptions,
    selectWallet,
    connect,
    disconnect,
    refresh,
    toast,
  };
}
