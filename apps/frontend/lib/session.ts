/**
 * Session keep-alive ping (#514).
 *
 * When the user confirms the "Still there?" prompt we hit a cheap endpoint
 * to (a) let the gateway slide the session expiry forward and (b) find out
 * whether the session is already dead. A dead session comes back 401 (or the
 * request fails outright), which the caller turns into a redirect to /login
 * with a `?next=` param so the user lands back where they were.
 *
 * `/health` is used as the cheap endpoint today; swap `SESSION_PING_PATH`
 * for a dedicated authenticated refresh route (e.g. `/auth/refresh`) once the
 * gateway exposes one. It's a bare `fetch` rather than the SDK client so a
 * 401 here does NOT trigger the client's global `onUnauthorized` redirect —
 * we want to control the redirect (and its `?next=`) ourselves.
 */
export const SESSION_PING_PATH = "/health";

/**
 * Read directly rather than via `lib/env` so importing the redirect helpers
 * never triggers the full env-schema parse (the guard mounts app-wide).
 */
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

/**
 * sessionStorage flag set just before an idle-session redirect and read once
 * on the way back in. Lets a form know it should silently restore its draft
 * (see lib/formDraft.ts) rather than prompting the user to resume it.
 */
const INTERRUPTED_KEY = "delego:session-interrupted";

function hasSessionStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
  );
}

/** Records that the current navigation away was an idle-session timeout. */
export function markSessionInterrupted(): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.setItem(INTERRUPTED_KEY, "1");
  } catch {
    // Storage unavailable — the resume banner is the fallback.
  }
}

/**
 * Reads and clears the interrupted flag. `true` means the user is arriving
 * back from a timeout redirect and drafts should be restored without a
 * prompt. Single-consumer by design (the flag is cleared on first read).
 */
export function consumeSessionInterrupted(): boolean {
  if (!hasSessionStorage()) return false;
  try {
    const value = window.sessionStorage.getItem(INTERRUPTED_KEY);
    if (value) window.sessionStorage.removeItem(INTERRUPTED_KEY);
    return value === "1";
  } catch {
    return false;
  }
}

/** Builds `/login?next=<current path+query>` for a post-login bounce-back. */
export function loginRedirectUrl(currentUrl: string): string {
  let next = "/";
  try {
    const parsed = new URL(currentUrl, "http://localhost");
    next = `${parsed.pathname}${parsed.search}`;
  } catch {
    next = "/";
  }
  return `/login?next=${encodeURIComponent(next)}`;
}

/**
 * Pings the keep-alive endpoint. Resolves `true` when the session is still
 * good, `false` on 401/403 or a network error — never rejects.
 */
export async function pingSession(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}${SESSION_PING_PATH}`, {
      method: "GET",
      credentials: "include",
      headers: { "Cache-Control": "no-cache" },
      signal,
    });
    if (res.status === 401 || res.status === 403) return false;
    return res.ok;
  } catch {
    return false;
  }
}
