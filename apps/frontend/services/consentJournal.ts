/**
 * consentJournal — personal signing-consent log (#591).
 *
 * Append-only localStorage journal recording every signature attempt
 * (successful or rejected) so users can audit what their wallet has signed.
 *
 * Storage contract:
 *  - Key:  "delego_consent_journal"
 *  - Max:  200 entries, FIFO pruning (oldest entries dropped first).
 *  - Never stores raw private keys, seeds, or full transaction XDR beyond
 *    the human-readable decoded summary.
 */

export type ConsentOutcome = "signed" | "rejected" | "error";

export interface ConsentEntry {
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Human-readable transaction summary (from preview decoder) */
  summary: string;
  /** Stellar transaction hash (hex), if available */
  txHash: string | null;
  /** App route/screen where the signature was requested */
  sourceScreen: string;
  /** Outcome of the signing attempt */
  outcome: ConsentOutcome;
}

const STORAGE_KEY = "delego_consent_journal";
const MAX_ENTRIES = 200;

// ─── Persistence helpers ──────────────────────────────────────────────────────

function loadEntries(): ConsentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ConsentEntry[];
  } catch {
    return [];
  }
}

function saveEntries(entries: ConsentEntry[]): void {
  try {
    // FIFO: if over cap, drop the oldest (front of array).
    const pruned =
      entries.length > MAX_ENTRIES
        ? entries.slice(entries.length - MAX_ENTRIES)
        : entries;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // localStorage may be full — best effort.
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Append a signing consent entry to the journal.
 * Safe to call from any signing path — rejected and errored attempts are
 * recorded alongside successful ones for a complete audit trail.
 */
export function appendConsentEntry(
  entry: Omit<ConsentEntry, "timestamp">
): void {
  const entries = loadEntries();
  entries.push({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  saveEntries(entries);
}

/** Return all journal entries, most-recent first. */
export function getConsentEntries(): ConsentEntry[] {
  return loadEntries().slice().reverse();
}

/**
 * Search and filter journal entries.
 *
 * @param query    Free-text search (matched against summary, txHash, sourceScreen)
 * @param outcome  Filter by outcome (undefined = all)
 * @param screen   Filter by source screen (undefined = all)
 */
export function filterConsentEntries(
  query?: string,
  outcome?: ConsentOutcome,
  screen?: string
): ConsentEntry[] {
  let entries = getConsentEntries();

  if (outcome) {
    entries = entries.filter((e) => e.outcome === outcome);
  }

  if (screen) {
    entries = entries.filter((e) => e.sourceScreen === screen);
  }

  if (query && query.trim().length > 0) {
    const q = query.trim().toLowerCase();
    entries = entries.filter(
      (e) =>
        e.summary.toLowerCase().includes(q) ||
        (e.txHash?.toLowerCase().includes(q) ?? false) ||
        e.sourceScreen.toLowerCase().includes(q)
    );
  }

  return entries;
}

/** Clear the entire journal. */
export function clearConsentJournal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best effort.
  }
}

/** Return all unique source screens seen in the journal (for filter dropdowns). */
export function getConsentScreens(): string[] {
  const entries = loadEntries();
  return [...new Set(entries.map((e) => e.sourceScreen))].sort();
}

/** Exported for tests. */
export { MAX_ENTRIES };
