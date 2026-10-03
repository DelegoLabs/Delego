"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
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
 * Shared wallet store.
 *
 * `useWallet` used to keep its state in per-component `useState`, which meant
 * every one of its ~19 call sites owned a private copy: connecting a wallet
 * updated the connect button but left the wallet page's status badge reading
 * "Not connected", and the header never reflected the connected buyer. Every
 * other app-wide hook here (network, currency, notifications, time format) is
 * backed by a Provider for exactly this reason — this hook was the odd one out.
 *
 * A module-level external store fixes the propagation without adding a Provider
 * boundary that would have to wrap every component test. `useSyncExternalStore`
 * keeps the hook API identical, so all existing call sites and tests are
 * unaffected.
 */
interface WalletStore {
  state: WalletState;
  toast: string | null;
  walletId: SupportedWallet;
  prevAddress: string | null;
}

let store: WalletStore = {
  state: isDemoMode() ? demoState : initialState,
  toast: null,
  walletId: getPersistedWalletId() ?? "freighter",
  prevAddress: null,
};

const listeners = new Set<() => void>();

/** True once the Freighter probe and its change watchers have been installed. */
let bootstrapped = false;

function getSnapshot(): WalletStore {
  return store;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function setStore(next: Partial<WalletStore>): void {
  store = { ...store, ...next };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Resets the shared store. Only for tests — each `useWallet.test.ts` case
 * renders a fresh hook and would otherwise inherit the previous case's
 * connection.
 */
export function __resetWalletStoreForTests(): void {
  store = {
    state: isDemoMode() ? demoState : initialState,
    toast: null,
    walletId: getPersistedWalletId() ?? "freighter",
    prevAddress: null,
  };
  bootstrapped = false;
  emit();
}

/**
 * Multi-wallet connection state (issue #774), defaulting to the Freighter
 * browser extension via `@stellar/freighter-api`.
 * Freighter only exists in the browser, so the SDK is dynamically imported
 * the same way the QR code library is lazy-loaded in DelegationQR.
 */
export function useWallet() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

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
  const walletId = store.walletId;
  const setWalletId = useCallback((id: SupportedWallet) => {
    setStore({ walletId: id });
  }, []);

  const setState = useCallback(
    (next: WalletState | ((prev: WalletState) => WalletState)) => {
      setStore({
        state:
          typeof next === "function"
            ? (next as (prev: WalletState) => WalletState)(store.state)
            : next,
      });
    },
    []
  );

  const setToast = useCallback((msg: string | null) => {
    setStore({ toast: msg });
  }, []);

  const updateWalletState = useCallback(
    (newState: WalletState) => {
      const prevAddr = store.prevAddress;
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

      setStore({ state: newState, prevAddress: newAddr });
    },
    [setToast]
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
  }, [updateWalletState, setState]);

  useEffect(() => {
    if (isDemoMode()) {
      setState(demoState);
      return;
    }

    // One bootstrap for the whole app: with a shared store, N call sites
    // mounting would otherwise each re-probe Freighter and register their own
    // account/network watchers.
    if (bootstrapped) return;
    bootstrapped = true;

    let isMounted = true;
    let unsubAccount: (() => void) | undefined;
    let unsubNetwork: (() => void) | undefined;

    void refresh().then((freighter) => {
      if (!freighter) return;
      // Nothing owns the watchers past the last subscriber's unmount, so keep
      // them for the life of the page rather than tying them to one instance.
      isMounted = true;

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
      // Deliberately a no-op: the shared store outlives any single hook
      // instance, so tearing down on unmount would stop wallet-change
      // updates for every still-mounted consumer.
    };
  }, [refresh, setState]);

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
    [updateWalletState, walletId, setState, setToast, setWalletId]
  );

  const selectWallet = useCallback(
    (id: SupportedWallet) => {
      setWalletId(id);
      setPersistedWalletId(id);
      setState({ ...initialState, status: "disconnected" });
    },
    [setState, setWalletId]
  );

  const disconnect = useCallback(() => {
    setStore({ prevAddress: null });
    clearPersistedWalletId();
    setState({ ...initialState, status: "disconnected" });
  }, [setState]);

  const walletOptions: WalletOption[] = detectInstalledWallets();

  return useMemo(
    () => ({
      ...snapshot.state,
      isConnected: snapshot.state.status === "connected",
      walletId: snapshot.walletId,
      walletOptions,
      selectWallet,
      connect,
      disconnect,
      refresh,
      toast: snapshot.toast,
    }),
    [
      snapshot,
      walletOptions,
      selectWallet,
      connect,
      disconnect,
      refresh,
    ]
  );
}
