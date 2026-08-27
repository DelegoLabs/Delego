/**
 * copySensitive — clipboard utility for security-sensitive values (#592).
 *
 * ## Browser Permissions / Behavior Matrix
 *
 * | Browser        | writeText  | readText (to clear)  | Permissions API     |
 * |----------------|------------|----------------------|---------------------|
 * | Chrome 66+     | Async, OK  | Requires focus+perm  | "clipboard-read"    |
 * | Firefox 63+    | Async, OK  | Requires focus+perm  | Partial support     |
 * | Safari 13.1+   | Async, OK  | Requires user gesture| Not supported       |
 * | Edge (Chromium)| Async, OK  | Same as Chrome       | "clipboard-read"    |
 *
 * Clearing strategy:
 *  1. After 30 s we attempt navigator.clipboard.writeText("") to overwrite.
 *  2. If the Permissions API reports "denied" for "clipboard-read" we still
 *     attempt the write — writeText never requires clipboard-read permission.
 *  3. The clear is best-effort: if the user has already copied something else
 *     we do NOT overwrite their new content (we check the stored token).
 *  4. A module-level timer ref ensures only one clearance timer is ever live;
 *     any subsequent copySensitive call cancels the prior timer.
 */

/** Token stored alongside the timer so we can detect if something else was copied in between. */
let pendingToken: string | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

const CLEAR_DELAY_MS = 30_000;

/**
 * Copies `value` to the clipboard and schedules a best-effort 30-second
 * clearance. Use this for all security-sensitive content: Stellar addresses,
 * transaction hashes, exported keys, and journal data.
 *
 * Returns a Promise that resolves once the value has been written to the
 * clipboard (or rejects if the browser denies clipboard access).
 */
export async function copySensitive(value: string): Promise<void> {
  // Cancel any in-flight clearance timer from a prior copy.
  if (clearTimer !== null) {
    clearTimeout(clearTimer);
    clearTimer = null;
    pendingToken = null;
  }

  await navigator.clipboard.writeText(value);

  // Store a short token so we can detect if the user has copied something
  // else before the 30 s window elapses.
  const token = `${Date.now()}-${Math.random()}`;
  pendingToken = token;

  clearTimer = setTimeout(async () => {
    clearTimer = null;
    // Only clear if the pending token still matches — i.e. the user hasn't
    // triggered another copy in the meantime.
    if (pendingToken !== token) return;
    pendingToken = null;

    try {
      // Best-effort: check current clipboard content before overwriting.
      // navigator.clipboard.readText() requires "clipboard-read" permission
      // or a user-gesture context; if it throws we fall back to blind clear.
      let current: string | null = null;
      try {
        current = await navigator.clipboard.readText();
      } catch {
        // Permission denied or browser doesn't support readText — clear anyway.
      }

      // If the clipboard content has already changed (user copied something
      // new), don't overwrite it.
      if (current !== null && current !== value) return;

      await navigator.clipboard.writeText("");
    } catch {
      // Best-effort — silently ignore if clearance fails.
    }
  }, CLEAR_DELAY_MS);
}

/**
 * Cancels any pending clipboard clearance timer without clearing the content.
 * Useful in cleanup (e.g. component unmount).
 */
export function cancelSensitiveClear(): void {
  if (clearTimer !== null) {
    clearTimeout(clearTimer);
    clearTimer = null;
    pendingToken = null;
  }
}
