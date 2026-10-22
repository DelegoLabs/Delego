/**
 * Sensitive-state purge for the strict idle auto-logout (#1021).
 *
 * Runs when an idle session times out. Everything that could let the next
 * person at this device act as (or read data belonging to) the previous user
 * is wiped: the ephemeral signing key held in the session-key worker, the
 * persisted session-key grant, cached API reads (Cache Storage + the
 * IndexedDB read model), local journals/queues (`clearAllLocalData`) and
 * sessionStorage.
 *
 * Each step runs independently — one failing (e.g. IndexedDB blocked) never
 * stops the others, and the purge never throws, so the logout redirect that
 * follows is guaranteed to happen.
 */

import { clearAllLocalData } from "./localDataClear";
import { API_READS_CACHE_NAME } from "./offlineCache";
import { clearReadModel } from "./readModelCache";
import { clearSessionKey } from "./session/sessionKeyClient";
import { revokeSessionKeyGrant } from "./sessionKeys";

/**
 * Dispatched on `window` once the purge finishes, so in-memory stores
 * (wallet connection, chat history, …) can reset themselves.
 */
export const SESSION_PURGED_EVENT = "delego:session-purged";

export async function purgeSensitiveSessionState(): Promise<void> {
  await Promise.allSettled([
    clearSessionKey(),
    Promise.resolve().then(revokeSessionKeyGrant),
    clearAllLocalData(),
    clearReadModel(),
    deleteApiReadsCache(),
  ]);

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.clear();
    } catch {
      // Storage unavailable — nothing to clear.
    }
    window.dispatchEvent(new CustomEvent(SESSION_PURGED_EVENT));
  }
}

async function deleteApiReadsCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  await caches.delete(API_READS_CACHE_NAME);
}
