/**
 * LOBSTR adapter — the second {@link StellarWalletAdapter} implementation,
 * built on the LOBSTR signer extension (the browser companion to the LOBSTR
 * mobile app).
 *
 * Behaviour notes:
 * - `detect()` probes the extension without prompting anyone.
 * - `connect()` opens the extension's access prompt and caches the public
 *   key it returns; `getAddress()` reads that cache rather than re-prompting
 *   (a passive refresh must never pop the LOBSTR app).
 * - `getNetwork()` returns `null`: the signer API does not expose the
 *   wallet's network, so the app reports "Unknown" and `useNetworkMismatch`
 *   treats it as indeterminate instead of raising a false mismatch.
 */

import type { StellarWalletAdapter, WalletNetworkInfo } from "./types";
import { WalletAccessDeniedError } from "./types";
import {
  clearLobstrSession,
  getCachedLobstrPublicKey,
  isLobstrInstalled,
  requestLobstrAccess,
  signLobstrTransaction,
} from "./lobstrClient";

async function detect(): Promise<boolean> {
  return isLobstrInstalled();
}

async function connect(): Promise<string> {
  const installed = await isLobstrInstalled();
  if (!installed) {
    throw new Error(
      "LOBSTR extension not found. Install it to connect your wallet."
    );
  }

  try {
    return await requestLobstrAccess();
  } catch (err) {
    // The prompt came back without an authorized account (declined, or no
    // wallet linked to the extension) — reported as a connection error with
    // the extension's own message.
    throw new WalletAccessDeniedError(
      err instanceof Error ? err.message : "Wallet access was denied"
    );
  }
}

async function getAddress(): Promise<string | null> {
  return getCachedLobstrPublicKey();
}

async function getNetwork(): Promise<WalletNetworkInfo | null> {
  return null;
}

async function signTransaction(xdr: string): Promise<string> {
  return signLobstrTransaction(xdr);
}

/** Drops the cached session; the extension keeps its own pairing. */
function disconnect(): void {
  clearLobstrSession();
}

export const lobstrAdapter: StellarWalletAdapter = {
  id: "lobstr",
  name: "LOBSTR",
  installUrl: "https://lobstr.co/signer-extension",
  detect,
  connect,
  getAddress,
  getNetwork,
  signTransaction,
  disconnect,
};
