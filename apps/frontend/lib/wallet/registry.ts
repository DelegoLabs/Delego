/**
 * Wallet adapter registry.
 *
 * Every supported wallet is registered here — `useWallet` and the picker
 * resolve adapters through `getWalletAdapter()` / `walletAdapters` only.
 * Adding a third wallet is one new file in this folder plus one line in
 * `walletAdapters` (see docs/wallet-adapters.md).
 */

import { freighterAdapter } from "./freighterAdapter";
import { lobstrAdapter } from "./lobstrAdapter";
import type { StellarWalletAdapter, WalletId } from "./types";

/** Used whenever no persisted selection exists yet, or it is no longer valid. */
export const DEFAULT_WALLET_ID: WalletId = "freighter";

/** Ordered list of supported wallets — the picker lists them in this order. */
export const walletAdapters: readonly StellarWalletAdapter[] = [
  freighterAdapter,
  lobstrAdapter,
];

/**
 * Resolves an adapter by id, falling back to the default wallet for unknown
 * ids (e.g. a stored id for an adapter that has since been removed).
 */
export function getWalletAdapter(id?: WalletId | null): StellarWalletAdapter {
  const match = id
    ? walletAdapters.find((adapter) => adapter.id === id)
    : undefined;
  const fallback =
    walletAdapters.find((adapter) => adapter.id === DEFAULT_WALLET_ID) ??
    walletAdapters[0];
  if (!fallback) {
    throw new Error("No wallet adapters are registered.");
  }
  return match ?? fallback;
}
