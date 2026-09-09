"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(
    (el) =>
      el.offsetParent !== null ||
      el.getClientRects().length > 0 ||
      process.env.NODE_ENV === "test" ||
      el === document.activeElement
  );
}

/**
 * Traps Tab/Shift+Tab focus inside `containerRef` while `active` is true, moves
 * initial focus into the container, and restores focus to the previously
 * focused element on close.
 *
 * Used by modal/drawer-style overlays (MobileNav, NotificationCenter) per the
 * FE-050 a11y sweep — see docs/frontend-a11y.md.
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean
) {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const focusable = getFocusable(container);
    (focusable[0] ?? container).focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !container) return;
      const elements = getFocusable(container);
      if (elements.length === 0) {
        e.preventDefault();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      const current = document.activeElement;

      if (e.shiftKey) {
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !container.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Only reclaim focus if it's still inside the trap (Escape, outside
      // click, close button). If focus already moved elsewhere — e.g. the
      // browser navigated because the user activated a link inside the
      // panel — respect that instead of yanking focus back.
      const activeEl = document.activeElement;
      const focusMovedElsewhere =
        activeEl &&
        activeEl !== document.body &&
        activeEl !== container &&
        !container.contains(activeEl);

      if (!focusMovedElsewhere) {
        previouslyFocusedRef.current?.focus();
      }
    };
  }, [active, containerRef]);
}
