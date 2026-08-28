"use client";

import { useCallback, useEffect } from "react";

export interface UseApprovalHotkeysOptions {
  totalItems: number;
  focusedIndex: number;
  setFocusedIndex: (idx: number) => void;
  onSelectFocused?: () => void;
  onToggleFocused?: () => void;
  onApproveFocused?: () => void;
  onRejectFocused?: () => void;
  onBulkApproveSelected?: () => void;
  onBulkRejectSelected?: () => void;
  enabled?: boolean;
}

const ARROW_NAV_STEP = 1;
const PAGE_NAV_STEP = 10;

/**
 * Keyboard navigation for the approvals list.
 *
 * Operates on the LOGICAL data list indices, not DOM nodes, so the user can
 * navigate across virtual window edges.
 *
 * Keys:
 *   j / ArrowDown   Move focus down
 *   k / ArrowUp     Move focus up
 *   d / PageDown   Page down
 *   u / PageUp   Page up
 *   g / Home       Jump to first
 *   G / End      Jump to last
 *   x / Space    Toggle select focused
 *   s / a        Approve focused
 *   r            Reject focused
 *   A            Bulk approve selected
 *   R            Bulk reject selected
 */
export function useApprovalHotkeys({
  totalItems,
  focusedIndex,
  setFocusedIndex,
  onSelectFocused,
  onToggleFocused,
  onApproveFocused,
  onRejectFocused,
  onBulkApproveSelected,
  onBulkRejectSelected,
  enabled = true,
}: UseApprovalHotkeysOptions): void {
  const clamp = useCallback(
    (idx: number) => Math.max(0, Math.min(totalItems - 1, idx)),
    [totalItems]
  );

  useEffect(() => {
    if (!enabled) return;

    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          target.isContentEditable
        ) {
          return;
        }
        if (e.metaKey || e.ctrlKey || e.altKey) return;
      }

      if (totalItems <= 0) return;

      switch (e.key) {
        case "j":
        case "ArrowDown": {
          e.preventDefault();
          setFocusedIndex(clamp(focusedIndex + ARROW_NAV_STEP));
          break;
        }
        case "k":
        case "ArrowUp": {
          e.preventDefault();
          setFocusedIndex(clamp(focusedIndex - ARROW_NAV_STEP));
          break;
        }
        case "d":
        case "PageDown": {
          e.preventDefault();
          setFocusedIndex(clamp(focusedIndex + PAGE_NAV_STEP));
          break;
        }
        case "u":
        case "PageUp": {
          e.preventDefault();
          setFocusedIndex(clamp(focusedIndex - PAGE_NAV_STEP));
          break;
        }
        case "g":
        case "Home": {
          e.preventDefault();
          setFocusedIndex(0);
          break;
        }
        case "G":
        case "End": {
          e.preventDefault();
          setFocusedIndex(clamp(totalItems - 1));
          break;
        }
        case "x":
        case " ": {
          e.preventDefault();
          onToggleFocused?.();
          break;
        }
        case "Enter": {
          e.preventDefault();
          onSelectFocused?.();
          break;
        }
        case "s":
        case "a": {
          e.preventDefault();
          onApproveFocused?.();
          break;
        }
        case "r": {
          if (e.shiftKey) {
            e.preventDefault();
            onBulkRejectSelected?.();
          } else {
            e.preventDefault();
            onRejectFocused?.();
          }
          break;
        }
        case "A": {
          e.preventDefault();
          onBulkApproveSelected?.();
          break;
        }
        case "Escape": {
          e.preventDefault();
          break;
        }
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey);
  }, [
    enabled,
    totalItems,
    focusedIndex,
    setFocusedIndex,
    clamp,
    onSelectFocused,
    onToggleFocused,
    onApproveFocused,
    onRejectFocused,
    onBulkApproveSelected,
    onBulkRejectSelected,
  ]);
}
