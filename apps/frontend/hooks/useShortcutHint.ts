"use client";

import { useEffect, useState } from "react";

/** Detect Apple platforms, where the primary modifier is ⌘ rather than Ctrl. */
export function isApplePlatform(platform?: string): boolean {
  const value =
    platform ??
    (typeof navigator !== "undefined" ? navigator.platform ?? "" : "");
  return /Mac|iPhone|iPad|iPod/.test(value);
}

/** Format a primary-modifier shortcut, e.g. `⌘K` on macOS and `Ctrl+K` elsewhere. */
export function formatShortcut(key: string, isMac: boolean): string {
  const upper = key.toUpperCase();
  return isMac ? `⌘${upper}` : `Ctrl+${upper}`;
}

export interface ShortcutHint {
  /** Platform-aware visible label, e.g. `⌘K` / `Ctrl+K`. */
  label: string;
  /** Value for `aria-keyshortcuts`, covering both ⌘ and Ctrl bindings. */
  ariaKeyShortcuts: string;
}

/**
 * Returns a platform-aware hint for a ⌘/Ctrl + `key` shortcut. The label
 * starts as the Ctrl variant so server and client render the same markup,
 * then switches to ⌘ after mount on Apple platforms.
 */
export function useShortcutHint(key: string): ShortcutHint {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(isApplePlatform());
  }, []);

  const upper = key.toUpperCase();
  return {
    label: formatShortcut(key, isMac),
    ariaKeyShortcuts: `Meta+${upper} Control+${upper}`,
  };
}
