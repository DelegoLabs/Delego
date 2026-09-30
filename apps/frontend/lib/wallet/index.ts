/**
 * Public surface of the wallet adapter layer.
 *
 * Import wallet adapters/registry/types from this barrel so new adapters
 * only have to touch `registry.ts` (see docs/wallet-adapters.md).
 */

export type {
  StellarWalletAdapter,
  WalletId,
  WalletNetworkInfo,
} from "./types";
export { WalletAccessDeniedError, toWalletError } from "./types";
export {
  DEFAULT_WALLET_ID,
  getWalletAdapter,
  walletAdapters,
} from "./registry";
export {
  WALLET_SELECTION_STORAGE_KEY,
  loadSelectedWalletId,
  saveSelectedWalletId,
} from "./selection";
export { freighterAdapter } from "./freighterAdapter";
export { lobstrAdapter } from "./lobstrAdapter";
