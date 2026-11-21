"use client";

import { useCommandPalette } from "./CommandPaletteProvider";
import { useShortcutHint } from "../../hooks/useShortcutHint";

/** Header search affordance that surfaces the ⌘K / Ctrl+K shortcut and opens the command palette. */
export function CommandPaletteTrigger() {
  const { setOpen } = useCommandPalette();
  const shortcut = useShortcutHint("k");
  const label = `Open command palette (${shortcut.label})`;

  return (
    <button
      type="button"
      className="command-palette-trigger"
      onClick={() => setOpen(true)}
      aria-label={label}
      aria-keyshortcuts={shortcut.ariaKeyShortcuts}
      title={label}
      data-testid="command-palette-trigger"
    >
      <span aria-hidden="true">🔍</span>
      <kbd className="command-palette-trigger-hint" aria-hidden="true">
        {shortcut.label}
      </kbd>
    </button>
  );
}
