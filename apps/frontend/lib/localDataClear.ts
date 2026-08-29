import { clearConsentJournal } from "../services/consentJournal";
import { clearQueue } from "./offlineQueue";

/**
 * "Clear local data" (#610, local-only erasure tier) — wipes locally-cached
 * app data and journals from this device only. Never touches the server;
 * runs immediately and synchronously verifiable (every key is gone by the
 * time the promise resolves).
 *
 * Scope is deliberately narrower than "every localStorage key the app
 * writes": it clears data/journal-shaped content (signing-consent journal,
 * approval notes, transaction tracking, address book, delegation tags,
 * dismissed announcements, notifications, per-resource escrow timelines and
 * cancel-grace state, the offline mutation queue) but leaves plain UI
 * preferences alone (theme, language, currency, network selection,
 * accessibility settings, onboarding/tour progress) — clearing those would
 * silently reset the user's app configuration, which isn't what "delete my
 * data" implies and isn't reversible from within this same flow.
 */

/** Exact keys cleared outright — static, well-known storage keys. */
const EXACT_KEYS = [
  "delego_tracked_txs", // services/txMonitor.ts
  "delego_local_approval_notes", // lib/localApprovalNotes.ts
  "delego_dismissed_announcements", // hooks/useAnnouncements.ts
  "delego_notifications", // hooks/useNotifications.tsx
  "delego_delegation_tags", // lib/delegationTags.ts
];

/** Key prefixes swept in full — used for per-resource-id storage (address book entries, escrow timelines, cancel-grace state). */
const KEY_PREFIXES = [
  "delego_address_book_", // services/addressBook.ts, per network
  "delego:escrow-timeline:", // lib/escrowTimeline.ts, per escrow
  "delego:cancel-grace:", // hooks/useCancelGrace.ts, per escrow
];

function sweepLocalStorage(): string[] {
  const cleared: string[] = [];
  if (typeof window === "undefined") return cleared;

  try {
    for (const key of EXACT_KEYS) {
      if (window.localStorage.getItem(key) !== null) {
        window.localStorage.removeItem(key);
        cleared.push(key);
      }
    }

    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      window.localStorage.removeItem(key);
      cleared.push(key);
    }
  } catch {
    // localStorage unavailable — nothing more to clear there.
  }

  return cleared;
}

export interface LocalDataClearResult {
  /** localStorage keys actually removed (present before the call). */
  clearedKeys: string[];
  /** Whether the IndexedDB offline mutation queue was cleared. */
  offlineQueueCleared: boolean;
}

/**
 * Clears all locally-cached app data for this device: the consent journal,
 * approval notes, transaction tracking, address book, delegation tags,
 * dismissed announcements, notifications, per-resource escrow
 * timelines/cancel-grace state, and the offline mutation queue.
 *
 * Verifiable by construction — the returned `clearedKeys` lists exactly
 * what was removed, and every write is synchronous (localStorage) or
 * awaited (IndexedDB) before this resolves.
 */
export async function clearAllLocalData(): Promise<LocalDataClearResult> {
  clearConsentJournal();
  const clearedKeys = sweepLocalStorage();

  let offlineQueueCleared = false;
  try {
    await clearQueue();
    offlineQueueCleared = true;
  } catch {
    // IndexedDB unavailable or the clear failed — report what did succeed.
  }

  return { clearedKeys, offlineQueueCleared };
}
