/**
 * txMonitor — stuck-transaction monitor service (#583).
 *
 * Tracks submitted Stellar/Soroban transaction hashes in localStorage,
 * polls the Horizon or Soroban RPC for status changes, and reports
 * pending/success/failed states back to subscribers.
 *
 * Design constraints:
 *  - Private-key-free: only transaction hashes are ever stored.
 *  - FIFO cap: localStorage list is pruned to MAX_TRACKED entries so storage
 *    never grows unbounded.
 *  - Duplicate-submission guard: submitting a hash that is already tracked
 *    as "pending" throws DuplicateSubmissionError.
 *  - Polling uses exponential back-off capped at MAX_POLL_INTERVAL_MS.
 *  - Terminal outcomes (success/failed) remove the hash from tracking.
 */

export type TxStatus = "pending" | "success" | "failed" | "timeout";

export interface TrackedTx {
  hash: string;
  network: string; // horizonUrl or rpcUrl used for polling
  submittedAt: number; // Date.now() epoch ms
  status: TxStatus;
}

export interface TxStatusUpdate {
  hash: string;
  status: TxStatus;
  /** Elapsed ms since submission */
  elapsedMs: number;
}

export type TxStatusListener = (update: TxStatusUpdate) => void;

/** Thrown when a hash that is already pending is submitted again. */
export class DuplicateSubmissionError extends Error {
  constructor(hash: string) {
    super(`Transaction ${hash} is already pending. Do not resubmit.`);
    this.name = "DuplicateSubmissionError";
  }
}

const STORAGE_KEY = "delego_tracked_txs";
const MAX_TRACKED = 50;
const PENDING_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes absolute timeout
const PENDING_WARNING_MS = 60 * 1_000; // warn after 60 s
const INITIAL_POLL_MS = 3_000;
const MAX_POLL_INTERVAL_MS = 30_000;
const POLL_BACKOFF_FACTOR = 1.5;

// ─── Persistence helpers ──────────────────────────────────────────────────────

function loadTracked(): TrackedTx[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TrackedTx[];
  } catch {
    return [];
  }
}

function saveTracked(txs: TrackedTx[]): void {
  try {
    // FIFO pruning: keep the most recent MAX_TRACKED entries.
    const pruned = txs.slice(-MAX_TRACKED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // localStorage may be full — best effort.
  }
}

// ─── In-memory active poll state ──────────────────────────────────────────────

interface PollState {
  timer: ReturnType<typeof setTimeout>;
  intervalMs: number;
}

const activePolls = new Map<string, PollState>();
const listeners = new Set<TxStatusListener>();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start tracking a submitted transaction hash.
 * Throws DuplicateSubmissionError if the hash is already pending.
 */
export function trackTransaction(hash: string, horizonUrl: string): void {
  const tracked = loadTracked();
  const existing = tracked.find((t) => t.hash === hash);

  if (existing && existing.status === "pending") {
    throw new DuplicateSubmissionError(hash);
  }

  const entry: TrackedTx = {
    hash,
    network: horizonUrl,
    submittedAt: Date.now(),
    status: "pending",
  };

  const updated = tracked.filter((t) => t.hash !== hash);
  updated.push(entry);
  saveTracked(updated);

  schedulePoll(entry, INITIAL_POLL_MS);
}

/**
 * Mark a transaction as resolved from an external UI context
 * (e.g. escrow release confirmation, approval callback).
 * Removes it from tracking.
 */
export function resolveTransaction(
  hash: string,
  outcome: "success" | "failed"
): void {
  stopPoll(hash);
  const tracked = loadTracked().filter((t) => t.hash !== hash);
  saveTracked(tracked);
  notifyListeners({ hash, status: outcome, elapsedMs: 0 });
}

/**
 * Returns all currently tracked transactions (including terminal ones still
 * in storage) for display.
 */
export function getTrackedTransactions(): TrackedTx[] {
  return loadTracked();
}

/** Subscribe to status update events. Returns an unsubscribe function. */
export function subscribeTxStatus(listener: TxStatusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Re-hydrate polls for any hashes that were pending before page reload.
 * Call once at app startup (e.g. in a top-level provider or layout).
 */
export function rehydratePendingPolls(): void {
  const tracked = loadTracked();
  for (const tx of tracked) {
    if (tx.status === "pending" && !activePolls.has(tx.hash)) {
      schedulePoll(tx, INITIAL_POLL_MS);
    }
  }
}

// ─── Polling internals ────────────────────────────────────────────────────────

function schedulePoll(tx: TrackedTx, intervalMs: number): void {
  stopPoll(tx.hash);

  const timer = setTimeout(() => void poll(tx, intervalMs), intervalMs);
  activePolls.set(tx.hash, { timer, intervalMs });
}

function stopPoll(hash: string): void {
  const state = activePolls.get(hash);
  if (state) {
    clearTimeout(state.timer);
    activePolls.delete(hash);
  }
}

async function poll(tx: TrackedTx, currentIntervalMs: number): Promise<void> {
  const elapsedMs = Date.now() - tx.submittedAt;

  // Absolute timeout.
  if (elapsedMs >= PENDING_TIMEOUT_MS) {
    stopPoll(tx.hash);
    markTerminal(tx.hash, "timeout");
    notifyListeners({ hash: tx.hash, status: "timeout", elapsedMs });
    return;
  }

  try {
    const status = await fetchTxStatus(tx.hash, tx.network);

    if (status === "success" || status === "failed") {
      stopPoll(tx.hash);
      markTerminal(tx.hash, status);
      notifyListeners({ hash: tx.hash, status, elapsedMs });
      return;
    }

    // Still pending — notify so UI can show elapsed time / warning.
    notifyListeners({ hash: tx.hash, status: "pending", elapsedMs });
  } catch {
    // Network error — continue polling with back-off.
  }

  // Schedule next poll with back-off.
  const nextInterval = Math.min(
    currentIntervalMs * POLL_BACKOFF_FACTOR,
    MAX_POLL_INTERVAL_MS
  );
  schedulePoll(tx, nextInterval);
}

async function fetchTxStatus(
  hash: string,
  horizonUrl: string
): Promise<TxStatus> {
  const url = `${horizonUrl}/transactions/${encodeURIComponent(hash)}`;
  const res = await fetch(url);

  if (res.ok) {
    const data = (await res.json()) as { successful?: boolean };
    return data.successful === false ? "failed" : "success";
  }

  if (res.status === 404) {
    // Not yet propagated — still pending.
    return "pending";
  }

  throw new Error(`Horizon returned ${res.status}`);
}

function markTerminal(hash: string, status: TxStatus): void {
  const tracked = loadTracked();
  const updated = tracked.map((t) => (t.hash === hash ? { ...t, status } : t));
  saveTracked(updated);
}

function notifyListeners(update: TxStatusUpdate): void {
  for (const listener of listeners) {
    try {
      listener(update);
    } catch {
      // Never let a subscriber crash the polling loop.
    }
  }
}

/** Visible only for tests. */
export function _clearAllForTest(): void {
  for (const [hash] of activePolls) stopPoll(hash);
  listeners.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // jsdom may not have localStorage.
  }
}

/** Exported so tests can inspect the warning threshold. */
export { PENDING_WARNING_MS };
