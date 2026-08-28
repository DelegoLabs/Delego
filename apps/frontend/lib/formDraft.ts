/**
 * Route-keyed form drafts (#514).
 *
 * When an idle session lapses mid-task the app redirects to /login and back
 * (see hooks/useIdleSession.tsx). Any wizard/form that opts in by calling
 * `saveFormDraft` on change gets its in-progress state parked in
 * localStorage under a key derived from the route, and restored on return.
 *
 * Deliberately tiny and dependency-free: every operation is best-effort and
 * never throws, mirroring lib/escrowTimeline.ts's storage idiom. Drafts
 * older than `DRAFT_TTL_MS` are treated as absent so a long-abandoned draft
 * doesn't resurrect weeks later.
 */

const STORAGE_PREFIX = "delego:form-draft:";

/** Drafts older than this are ignored on read (and cleared opportunistically). */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1_000;

interface StoredDraft<T> {
  /** ISO-8601 timestamp the draft was last written. */
  savedAt: string;
  data: T;
}

/**
 * Normalizes a route into a stable storage key. Query strings and hashes are
 * dropped so `/delegations/new?step=2` and `/delegations/new` share a draft;
 * a trailing slash is trimmed so `/settings/` and `/settings` match.
 */
export function draftStorageKey(route: string): string {
  const path = route.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  return `${STORAGE_PREFIX}${path}`;
}

function hasLocalStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

/** Persists `data` as the draft for `route`. Never throws. */
export function saveFormDraft<T>(route: string, data: T): void {
  if (!hasLocalStorage()) return;
  try {
    const payload: StoredDraft<T> = { savedAt: new Date().toISOString(), data };
    window.localStorage.setItem(draftStorageKey(route), JSON.stringify(payload));
  } catch {
    // Storage unavailable (private mode, quota) — the form still works in
    // memory, the draft just won't survive the redirect.
  }
}

/**
 * Reads the draft for `route`, or `null` if there is none, it's unparseable,
 * or it's past `DRAFT_TTL_MS`. A stale/corrupt entry is cleared as a side
 * effect so it doesn't linger.
 */
export function readFormDraft<T>(route: string): T | null {
  if (!hasLocalStorage()) return null;
  const key = draftStorageKey(route);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft<T>>;
    if (
      !parsed ||
      typeof parsed.savedAt !== "string" ||
      !("data" in parsed)
    ) {
      window.localStorage.removeItem(key);
      return null;
    }
    const age = Date.now() - new Date(parsed.savedAt).getTime();
    if (!Number.isFinite(age) || age < 0 || age > DRAFT_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.data as T;
  } catch {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore — nothing more we can do
    }
    return null;
  }
}

/** Removes the draft for `route` (e.g. after a successful submit). Never throws. */
export function clearFormDraft(route: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(draftStorageKey(route));
  } catch {
    // ignore
  }
}
