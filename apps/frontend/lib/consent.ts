/**
 * Privacy/telemetry consent model (#612).
 *
 * Three tiers:
 *  - essential: always on, non-tracking (app functionality only — never
 *    gated, never logged as a "choice" since there isn't one).
 *  - productAnalytics: in-app usage/feature analytics.
 *  - marketing: marketing/attribution tracking.
 *
 * Stored, mutable, and auditable: `ConsentPreferences` is the current state;
 * every change appends a timestamped `ConsentLogEntry` so users (and this
 * app) can see the full history of what was granted/revoked and when.
 * Persisted to localStorage — same reasoning as the rest of the app's
 * client-side state (services/consentJournal.ts, lib/localApprovalNotes.ts):
 * best-effort, never throws, degrades to defaults if storage is unavailable.
 */

export type ConsentCategory = "productAnalytics" | "marketing";

export interface ConsentPreferences {
  /** Always true — essential/functional behavior is never gated by consent. */
  essential: true;
  productAnalytics: boolean;
  marketing: boolean;
}

export type ConsentSource = "first-run-accept-all" | "first-run-essential-only" | "settings";

export interface ConsentLogEntry {
  /** ISO-8601 timestamp of the change. */
  timestamp: string;
  category: ConsentCategory;
  granted: boolean;
  source: ConsentSource;
}

const PREFS_KEY = "delego_consent_preferences";
const LOG_KEY = "delego_consent_log";
const MAX_LOG_ENTRIES = 200;

/** Default preferences before the user has made any choice: essential only. */
export const DEFAULT_CONSENT_PREFERENCES: ConsentPreferences = {
  essential: true,
  productAnalytics: false,
  marketing: false,
};

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best effort — storage unavailable or full.
  }
}

/**
 * The user's current consent preferences, or `null` if they haven't made a
 * first-run choice yet (distinct from `DEFAULT_CONSENT_PREFERENCES`, which
 * is what's *assumed* — essential-only — until a choice is recorded).
 */
export function getConsentPreferences(): ConsentPreferences | null {
  return readJson<ConsentPreferences>(PREFS_KEY);
}

/** True once the user has made any first-run or settings consent choice. */
export function hasConsentChoice(): boolean {
  return getConsentPreferences() !== null;
}

/** Full, timestamped history of every consent change, oldest first. */
export function getConsentLog(): ConsentLogEntry[] {
  return readJson<ConsentLogEntry[]>(LOG_KEY) ?? [];
}

function appendLogEntries(entries: ConsentLogEntry[]): void {
  const log = [...getConsentLog(), ...entries];
  const pruned = log.length > MAX_LOG_ENTRIES ? log.slice(log.length - MAX_LOG_ENTRIES) : log;
  writeJson(LOG_KEY, pruned);
}

/**
 * Applies a full set of consent preferences, logging one entry per category
 * that actually changed (so "Accept all" from a fresh install logs both
 * categories, but re-saving unchanged settings logs nothing). Takes effect
 * immediately — callers don't need to reload; `lib/analytics.ts`'s emitter
 * reads current preferences on every call, not just at startup.
 */
export function setConsentPreferences(
  next: Pick<ConsentPreferences, "productAnalytics" | "marketing">,
  source: ConsentSource
): ConsentPreferences {
  const previous = getConsentPreferences() ?? DEFAULT_CONSENT_PREFERENCES;
  const resolved: ConsentPreferences = {
    essential: true,
    productAnalytics: next.productAnalytics,
    marketing: next.marketing,
  };

  const timestamp = new Date().toISOString();
  const changedEntries: ConsentLogEntry[] = [];
  (["productAnalytics", "marketing"] as const).forEach((category) => {
    if (previous[category] !== resolved[category]) {
      changedEntries.push({
        timestamp,
        category,
        granted: resolved[category],
        source,
      });
    }
  });

  writeJson(PREFS_KEY, resolved);
  if (changedEntries.length > 0) appendLogEntries(changedEntries);

  return resolved;
}

/** Convenience for the first-run banner's "Accept all" action. */
export function acceptAllConsent(): ConsentPreferences {
  return setConsentPreferences(
    { productAnalytics: true, marketing: true },
    "first-run-accept-all"
  );
}

/** Convenience for the first-run banner's implicit essential-only default (dismiss without customizing). */
export function acceptEssentialOnlyConsent(): ConsentPreferences {
  return setConsentPreferences(
    { productAnalytics: false, marketing: false },
    "first-run-essential-only"
  );
}

/** Test/debug only — clears stored preferences and log. Not exposed in any UI. */
export function resetConsentForTesting(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PREFS_KEY);
    window.localStorage.removeItem(LOG_KEY);
  } catch {
    // no-op
  }
}
