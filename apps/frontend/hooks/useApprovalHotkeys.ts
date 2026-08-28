"use client";

import { useEffect } from "react";

export interface UseApprovalHotkeysOptions {
  /** Length of the full logical data array — NOT the number of currently mounted/virtualized rows */
  itemCount: number;
  setFocusedIndex: (updater: (prev: number) => number) => void;
  onToggleFocused?: () => void;
  enabled?: boolean;
}

/**
 * j/k navigation over the LOGICAL data list (indices 0..itemCount-1). This is deliberately
 * independent of which rows the virtualizer currently has mounted in the DOM, so moving focus
 * past the rendered window still works — the caller is responsible for scrolling the new
 * focusedIndex into view (e.g. via `virtualizer.scrollToIndex`).
 */
export function useApprovalHotkeys({
  itemCount,
  setFocusedIndex,
  onToggleFocused,
  enabled = true,
}: UseApprovalHotkeysOptions) {
  useEffect(() => {
    if (!enabled || itemCount === 0) return;

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if (e.key === "j") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(itemCount - 1, prev + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(0, prev - 1));
      } else if ((e.key === "x" || e.key === " ") && onToggleFocused) {
        e.preventDefault();
        onToggleFocused();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [itemCount, enabled, setFocusedIndex, onToggleFocused]);
}
