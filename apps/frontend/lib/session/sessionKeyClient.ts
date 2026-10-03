import type { SessionKeyWorkerMessage } from "../../workers/sessionKeyWorker";

/**
 * Owns the dedicated Web Worker that holds the ephemeral session signing key
 * (#514). The private key is generated inside the worker and never crosses
 * back to the main thread, so anything that can run script on the page cannot
 * read it.
 *
 * A single worker is shared process-wide: the grant modal, the app-shell
 * provider and the idle-session guard all talk to the same one.
 */

let worker: Worker | null = null;

function workersAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.Worker !== "undefined";
}

/**
 * Returns the shared worker, creating it on first use.
 * Throws when Web Workers are unavailable (SSR, or a test environment that
 * does not stub `Worker`).
 */
export function initSessionKeyWorker(): Worker {
  if (worker) {
    return worker;
  }
  if (!workersAvailable()) {
    throw new Error("Web Workers are unavailable in this environment.");
  }
  worker = new Worker(new URL("../../workers/sessionKeyWorker.ts", import.meta.url), {
    type: "module",
    name: "session-key-worker",
  });
  return worker;
}

/** The shared worker if one has been created, otherwise null. */
export function getSessionKeyWorker(): Worker | null {
  return worker;
}

/** Sends a message to the shared worker, creating it if necessary. */
export function postToSessionKeyWorker(message: SessionKeyWorkerMessage): void {
  initSessionKeyWorker().postMessage(message);
}

/**
 * Wipes the key held by the worker and tears it down. Safe to call when no
 * worker was ever created, which is the common case on a page that never
 * granted a session key.
 */
export async function clearSessionKey(): Promise<void> {
  const current = worker;
  worker = null;
  if (!current) {
    return;
  }
  try {
    current.postMessage({ type: "CLEAR_KEY" } satisfies SessionKeyWorkerMessage);
    current.terminate();
  } catch {
    // A worker that is already gone has nothing left to wipe.
  }
}

/** Test seam: drops the shared worker without messaging it. */
export function resetSessionKeyWorker(): void {
  worker = null;
}
