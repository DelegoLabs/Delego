/**
 * Global keyboard-shortcut primitives (Issue #3 — Advanced keyboard
 * shortcuts & accessibility).
 *
 * A shortcut is a `keys` sequence (e.g. `["g", "o"]`) plus the action it
 * triggers. Pure helpers live here so the sequence/timing logic and the
 * typing-target guard can be unit-tested without a DOM event loop; the
 * document listener itself lives in `hooks/useGlobalShortcuts.tsx`.
 */

export type ShortcutCategory = "global" | "navigation" | "orders" | "chat";

export interface KeyboardShortcutDefinition {
  /** Ordered key sequence, e.g. ["g", "o"]. Single-element for one-shot keys. */
  keys: string[];
  description: string;
  category: ShortcutCategory;
  action: () => void;
}

/** How long (ms) a sequence prefix (e.g. the "g" in "g o") stays pending. */
export const SEQUENCE_TIMEOUT_MS = 1200;

/** Event dispatched when Esc is pressed outside a field, so overlays can close. */
export const CLOSE_OVERLAYS_EVENT = "delego:close-overlays";

/**
 * Whether keystrokes should be ignored because the user is typing. Covers
 * inputs, textareas, selects and contenteditable hosts.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    // jsdom exposes `isContentEditable` as `undefined` on some elements, so
    // coerce explicitly to keep the boolean return contract.
    Boolean(target.isContentEditable)
  );
}

/** Case-insensitive key comparison that preserves "?" / "Escape" semantics. */
export function keysEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Whether a shortcut's key sequence is a chained shortcut like `g o`. */
export function isSequence(shortcut: KeyboardShortcutDefinition): boolean {
  return shortcut.keys.length > 1;
}

/** Human-readable label, e.g. `["g", "o"]` → "g then o". */
export function formatShortcutKeys(keys: string[]): string {
  return keys.join(" then ");
}

/**
 * Given the pressed key and the currently-pending prefix keys, returns the
 * shortcut to run (if the press completes a sequence or a single-key binding)
 * or the new pending prefix (if the press starts a sequence), or neither.
 */
export interface ShortcutResolution {
  run?: KeyboardShortcutDefinition;
  pending: string[];
}

export function resolveShortcut(
  shortcuts: KeyboardShortcutDefinition[],
  pressedKey: string,
  pending: string[]
): ShortcutResolution {
  const candidate = [...pending, pressedKey];
  const exact = shortcuts.find(
    (shortcut) =>
      shortcut.keys.length === candidate.length &&
      shortcut.keys.every((key, index) => keysEqual(key, candidate[index]))
  );
  if (exact) return { run: exact, pending: [] };

  // Is `candidate` still a viable prefix of a longer sequence?
  const isPrefix = shortcuts.some(
    (shortcut) =>
      shortcut.keys.length > candidate.length &&
      candidate.every((key, index) => keysEqual(shortcut.keys[index], key))
  );
  if (isPrefix) return { pending: candidate };

  // Not a prefix: fall back to treating the press as a fresh start.
  const fresh = shortcuts.find(
    (shortcut) => shortcut.keys.length === 1 && keysEqual(shortcut.keys[0], pressedKey)
  );
  if (fresh) return { run: fresh, pending: [] };

  const startsSequence = shortcuts.some(
    (shortcut) =>
      shortcut.keys.length > 1 && keysEqual(shortcut.keys[0], pressedKey)
  );
  return { pending: startsSequence ? [pressedKey] : [] };
}
