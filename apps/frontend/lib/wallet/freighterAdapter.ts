/**
 * Freighter adapter — the first {@link StellarWalletAdapter} implementation.
 *
 * All `@stellar/freighter-api` usage now lives here (it only exists in the
 * browser, so the SDK is dynamically imported the same way the QR code
 * library is lazy-loaded in DelegationQR). `useWallet` consumes this file
 * through the adapter interface, so its observable behaviour — statuses,
 * messages, change listeners — is unchanged from the pre-adapter hook.
 */

import type { StellarWalletAdapter, WalletNetworkInfo } from "./types";
import { WalletAccessDeniedError } from "./types";

type FreighterModule = typeof import("@stellar/freighter-api");

/** Dynamic import kept in one place so every call shares the module instance. */
function loadFreighter(): Promise<FreighterModule> {
  return import("@stellar/freighter-api");
}

/** Freighter fallback when the extension returns no message of its own. */
const ADDRESS_ERROR_FALLBACK = "Couldn't read the wallet address. Please try again.";
const NETWORK_ERROR_FALLBACK = "Couldn't read the Freighter network. Please try again.";

async function detect(): Promise<boolean> {
  const freighter = await loadFreighter();
  const res = await freighter.isConnected();
  return !res.error && res.isConnected;
}

async function connect(): Promise<string> {
  const freighter = await loadFreighter();
  const access = await freighter.requestAccess();
  if (access.error || !access.address) {
    throw new WalletAccessDeniedError(
      access.error?.message ?? "Wallet access was denied"
    );
  }
  return access.address;
}

async function getAddress(): Promise<string | null> {
  const freighter = await loadFreighter();
  const allowed = await freighter.isAllowed();
  if (allowed.error || !allowed.isAllowed) return null;

  const res = await freighter.getAddress();
  if (res.error || !res.address) {
    throw new Error(res.error?.message ?? ADDRESS_ERROR_FALLBACK);
  }
  return res.address;
}

async function getNetwork(): Promise<WalletNetworkInfo | null> {
  const freighter = await loadFreighter();
  const net = await freighter.getNetwork();
  if (net.error) return null;
  return {
    network: net.network ?? null,
    networkPassphrase: net.networkPassphrase ?? null,
  };
}

async function signTransaction(xdr: string): Promise<string> {
  const freighter = await loadFreighter();
  const address = await getAddress();
  if (!address) {
    throw new WalletAccessDeniedError(
      "Connect Freighter before signing a transaction."
    );
  }

  const net = await freighter.getNetwork();
  if (net.error || !net.networkPassphrase) {
    throw new Error(NETWORK_ERROR_FALLBACK);
  }

  const res = await freighter.signTransaction(xdr, {
    address,
    networkPassphrase: net.networkPassphrase,
  });
  if (res.error || !res.signedTxXdr) {
    throw new Error(res.error?.message ?? "Signing was rejected.");
  }
  return res.signedTxXdr;
}

/**
 * Freighter exposes no dApp session to revoke — disconnecting only resets
 * local state, which `useWallet.disconnect()` does.
 */
function disconnect(): void {
  /* no-op by design */
}

/**
 * Registers Freighter's account/network change listeners and returns a
 * cleanup. The SDK exposes them under a few shapes (top-level, `default`
 * namespace, or `WatchWalletChanges`), so each is feature-detected the same
 * way the pre-adapter hook did. Resolves with `undefined` when the extension
 * offers no listeners.
 */
async function subscribe(onChange: () => void): Promise<(() => void) | void> {
  const freighter = await loadFreighter();

  const mod = freighter as unknown as Record<string, unknown>;
  const fallback =
    "default" in mod && mod.default && typeof mod.default === "object"
      ? (mod.default as Record<string, unknown>)
      : undefined;

  const onAccountChange = (mod.onAccountChange ??
    fallback?.onAccountChange ??
    mod.getAccountChangeHandler ??
    fallback?.getAccountChangeHandler) as
    | ((cb: (addr: string) => void) => (() => void) | { remove: () => void })
    | undefined;

  const onNetworkChange = (mod.onNetworkChange ??
    fallback?.onNetworkChange ??
    mod.getNetworkChangeHandler ??
    fallback?.getNetworkChangeHandler) as
    | ((cb: (net: string) => void) => (() => void) | { remove: () => void })
    | undefined;

  const watchWalletChanges = (mod.WatchWalletChanges ??
    fallback?.WatchWalletChanges) as
    | ((cb: (state: unknown) => void) => (() => void) | { remove: () => void })
    | undefined;

  const cleanups: Array<() => void> = [];
  const track = (registration: unknown) => {
    if (typeof registration === "function") {
      cleanups.push(registration as () => void);
    } else if (
      registration &&
      typeof (registration as { remove?: () => void }).remove === "function"
    ) {
      const removable = registration as { remove: () => void };
      cleanups.push(() => removable.remove());
    }
  };

  if (typeof onAccountChange === "function") track(onAccountChange(onChange));
  if (typeof onNetworkChange === "function") track(onNetworkChange(onChange));
  if (cleanups.length === 0 && typeof watchWalletChanges === "function") {
    track(watchWalletChanges(onChange));
  }

  if (cleanups.length === 0) return undefined;
  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
}

export const freighterAdapter: StellarWalletAdapter = {
  id: "freighter",
  name: "Freighter",
  installUrl: "https://www.freighter.app/",
  detect,
  connect,
  getAddress,
  getNetwork,
  signTransaction,
  disconnect,
  subscribe,
};
