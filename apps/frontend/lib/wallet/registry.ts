import type { StellarWalletAdapter } from "./types";
import { freighterAdapter } from "./freighter";
import { lobstrAdapter } from "./lobstr";

/** localStorage key for the per-browser wallet choice (delego_* naming). */
export const WALLET_ADAPTER_STORAGE_KEY = "delego_wallet_adapter";

/** Ordered as shown in the picker. Freighter stays the default. */
export const walletAdapters: readonly StellarWalletAdapter[] = [
  freighterAdapter,
  lobstrAdapter,
];

export const defaultWalletAdapter = freighterAdapter;

export function getWalletAdapter(
  id: string | null | undefined
): StellarWalletAdapter {
  return walletAdapters.find((adapter) => adapter.id === id) ??
    defaultWalletAdapter;
}

export function getStoredWalletAdapterId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(WALLET_ADAPTER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeWalletAdapterId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WALLET_ADAPTER_STORAGE_KEY, id);
  } catch {
    // Storage being unavailable only loses persistence, not connection.
  }
}

/**
 * Detect every registered wallet, mapping failures to "not installed" and
 * capping the wait so one wallet's handshake cannot stall the connect flow
 * (an installed extension answers instantly; the cap only trims the absent
 * case, which LOBSTR otherwise resolves after a 2s internal timeout).
 */
export async function detectWalletAdapter(
  adapter: StellarWalletAdapter,
  timeoutMs = 800
): Promise<boolean> {
  return Promise.race([
    adapter.detect().catch(() => false),
    new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), timeoutMs)
    ),
  ]);
}

export async function detectWalletAdapters(
  timeoutMs = 800
): Promise<{ adapter: StellarWalletAdapter; detected: boolean }[]> {
  return Promise.all(
    walletAdapters.map(async (adapter) => ({
      adapter,
      detected: await detectWalletAdapter(adapter, timeoutMs),
    }))
  );
}
