"use client";

import { useMemo, useRef } from "react";
import {
  formatShortcutKeys,
  type KeyboardShortcutDefinition,
  type ShortcutCategory,
} from "../lib/shortcuts";
import { useFocusTrap } from "../hooks/useFocusTrap";

export interface ShortcutCheatSheetProps {
  shortcuts: KeyboardShortcutDefinition[];
  onClose: () => void;
}

const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  global: "Global",
  navigation: "Navigation",
  orders: "Orders",
  chat: "Chat",
};

const CATEGORY_ORDER: ShortcutCategory[] = [
  "global",
  "navigation",
  "orders",
  "chat",
];

/**
 * Global, discoverable reference for every registered keyboard shortcut
 * (Issue #3), opened with `?`. Rendered as a modal dialog with a focus trap and
 * grouped by category for scanning.
 */
export function ShortcutCheatSheet({
  shortcuts,
  onClose,
}: ShortcutCheatSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ containerRef: dialogRef, isActive: true, onEscape: onClose });

  const grouped = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        items: shortcuts.filter((shortcut) => shortcut.category === category),
      })).filter((group) => group.items.length > 0),
    [shortcuts]
  );

  return (
    <div className="shortcut-cheatsheet-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="shortcut-cheatsheet focus-visible-ring"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-cheatsheet-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shortcut-cheatsheet-header">
          <h2 id="shortcut-cheatsheet-title">Keyboard shortcuts</h2>
          <button
            type="button"
            className="shortcut-cheatsheet-close focus-visible-ring"
            aria-label="Close keyboard shortcuts"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="shortcut-cheatsheet-body">
          {grouped.map((group) => (
            <section key={group.category} className="shortcut-cheatsheet-group">
              <h3 className="shortcut-cheatsheet-group-label">
                {CATEGORY_LABELS[group.category]}
              </h3>
              <dl className="shortcut-cheatsheet-list">
                {group.items.map((shortcut) => (
                  <div
                    key={formatShortcutKeys(shortcut.keys)}
                    className="shortcut-cheatsheet-row"
                  >
                    <dt>
                      <kbd>{formatShortcutKeys(shortcut.keys)}</kbd>
                    </dt>
                    <dd>{shortcut.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
