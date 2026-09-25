"use client";

/**
 * useVirtualApprovalHotkeys (Issue 4)
 *
 * Adapts useApprovalHotkeys to work with a logical index rather than a
 * DOM id-list. Because the virtualizer unmounts rows outside the overscan
 * window, DOM refs for off-screen rows don't exist — so j/k navigate the
 * full logical list index and we call `scrollToIndex` to bring the target
 * row into view before React re-mounts the row.
 *
 * This is a thin wrapper: it re-uses the same keyboard event logic as
 * useApprovalHotkeys (same guards, same undo window) but coordinates with
 * the virtual list's scroll-to primitive instead of DOM `.focus()`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { UndoAction } from "./useApprovalHotkeys";

export interface UseVirtualApprovalHotkeysOptions {
  /** Total number of items in the logical list. */
  itemCount: number;
  /** Currently focused logical index. */
  focusedIndex: number | null;
  /** Called to move focus to a new index AND scroll it into view. */
  scrollToIndex: (index: number) => void;
  onApprove: (index: number) => void | Promise<unknown>;
  onReject: (index: number) => void | Promise<unknown>;
  onOpenDrawer: (index: number) => void;
  /** Suspend hotkeys while a modal/drawer is managing its own keys. */
  disabled?: boolean;
  undoWindowMs?: number;
}

export interface UseVirtualApprovalHotkeysResult {
  showCheatSheet: boolean;
  setShowCheatSheet: (v: boolean) => void;
  undoAction: UndoAction | null;
  dismissUndo: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function useVirtualApprovalHotkeys({
  itemCount,
  focusedIndex,
  scrollToIndex,
  onApprove,
  onReject,
  onOpenDrawer,
  disabled = false,
  undoWindowMs = 5000,
}: UseVirtualApprovalHotkeysOptions): UseVirtualApprovalHotkeysResult {
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [undoAction, setUndoActionState] = useState<UndoAction | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  // focusedIndex can change outside this hook (mouse clicks, query param sync);
  // keep a ref so the keydown handler always reads the latest value without
  // becoming a stale closure.
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;

  const setUndoAction = useCallback(
    (action: UndoAction | null) => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoActionState(action);
      if (action) {
        undoTimerRef.current = setTimeout(
          () => setUndoActionState(null),
          undoWindowMs
        );
      }
    },
    [undoWindowMs]
  );

  const dismissUndo = useCallback(
    () => setUndoAction(null),
    [setUndoAction]
  );

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (disabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "?") {
        e.preventDefault();
        setShowCheatSheet((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setShowCheatSheet(false);
        return;
      }

      if (itemCount === 0) return;

      const current = focusedIndexRef.current;

      switch (e.key) {
        case "j": {
          e.preventDefault();
          const next =
            current === null
              ? 0
              : Math.min(itemCount - 1, current + 1);
          // scrollToIndex both scrolls the virtualizer AND updates focusedIndex
          scrollToIndex(next);
          return;
        }
        case "k": {
          e.preventDefault();
          const prev =
            current === null
              ? 0
              : Math.max(0, current - 1);
          scrollToIndex(prev);
          return;
        }
        case "Enter": {
          if (current !== null) {
            e.preventDefault();
            onOpenDrawer(current);
          }
          return;
        }
        case "a": {
          if (current !== null) {
            e.preventDefault();
            const idx = current;
            void onApprove(idx);
            setUndoAction({
              message: `Approved item at position ${idx + 1}`,
              undo: () => onReject(idx),
            });
          }
          return;
        }
        case "r": {
          if (current !== null) {
            e.preventDefault();
            const idx = current;
            void onReject(idx);
            setUndoAction({
              message: `Rejected item at position ${idx + 1}`,
              undo: () => onApprove(idx),
            });
          }
          return;
        }
        default:
          return;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    itemCount,
    scrollToIndex,
    onApprove,
    onReject,
    onOpenDrawer,
    disabled,
    setUndoAction,
  ]);

  return { showCheatSheet, setShowCheatSheet, undoAction, dismissUndo };
}
