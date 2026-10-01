/**
 * Persisted wallet selection — one choice per browser (localStorage), so a
 * returning visitor lands straight on the wallet they used last time instead
 * of the default.
 *
 * Follows the same defensive pattern as `lib/sessionKeys.ts` and
 * `lib/localApprovalNotes.ts`: SSR-safe, and storage failures degrade to
 * "no stored selection" rather than throwing.
 */

import type { WalletId } from "./types";

export const WALLET_SELECTION_STORAGE_KEY = "delego_selected_wallet";

function hasLocalStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

/** Stored wallet id, or `null` when nothing (valid) was stored. */
export function loadSelectedWalletId(): WalletId | null {
  if (!hasLocalStorage()) return null;
  try {
    const stored = window.localStorage.getItem(WALLET_SELECTION_STORAGE_KEY);
    return stored && stored.trim() ? stored : null;
  } catch {
    return null;
  }
}

/** Remembers the user's wallet choice for this browser. */
export function saveSelectedWalletId(id: WalletId): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(WALLET_SELECTION_STORAGE_KEY, id);
  } catch {
    // Storage unavailable (private browsing, quota) — the selection simply
    // does not survive a reload.
  }
}
