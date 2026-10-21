"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CLOSE_OVERLAYS_EVENT,
  SEQUENCE_TIMEOUT_MS,
  isTypingTarget,
  resolveShortcut,
  type KeyboardShortcutDefinition,
} from "../lib/shortcuts";
import { ShortcutCheatSheet } from "../components/ShortcutCheatSheet";

interface GlobalShortcutsContextValue {
  /** Every active shortcut (built-ins plus feature-registered ones). */
  shortcuts: KeyboardShortcutDefinition[];
  /** Adds shortcuts for the lifetime of the calling component. */
  registerShortcuts: (
    shortcuts: KeyboardShortcutDefinition[]
  ) => () => void;
  showCheatSheet: boolean;
  setShowCheatSheet: (show: boolean) => void;
}

const GlobalShortcutsContext =
  createContext<GlobalShortcutsContextValue | null>(null);

/** Read the shortcut registry (used by the cheat sheet / help surfaces). */
export function useGlobalShortcuts(): GlobalShortcutsContextValue {
  const ctx = useContext(GlobalShortcutsContext);
  if (!ctx) {
    throw new Error(
      "useGlobalShortcuts must be used within a GlobalShortcutsProvider"
    );
  }
  return ctx;
}

/** Registers extra shortcuts for as long as the caller is mounted. */
export function useRegisterShortcuts(
  shortcuts: KeyboardShortcutDefinition[]
): void {
  const { registerShortcuts } = useGlobalShortcuts();
  useEffect(() => registerShortcuts(shortcuts), [shortcuts, registerShortcuts]);
}

/**
 * Owns the global keydown listener (Issue #3).
 *
 * Behaviour:
 *  - keystrokes inside inputs/textareas/contenteditable are ignored;
 *  - `g`-prefixed sequences (g o / g w / …) resolve within
 *    `SEQUENCE_TIMEOUT_MS`, keyed off a ref so a pending prefix never
 *    re-renders the tree;
 *  - `?` toggles the cheat sheet, `Escape` closes the cheat sheet and
 *    dispatches `CLOSE_OVERLAYS_EVENT` for drawers/dialogs;
 *  - the listener lives on `window` and bails out when an inner (document)
 *    handler has already called `preventDefault`, so page-scoped hotkeys
 *    take precedence over these global ones.
 */
export function GlobalShortcutsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [registered, setRegistered] = useState<KeyboardShortcutDefinition[]>([]);
  const [showCheatSheet, setShowCheatSheet] = useState(false);

  const pendingRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const registerShortcuts = useCallback(
    (shortcuts: KeyboardShortcutDefinition[]) => {
      setRegistered((prev) => [...prev, ...shortcuts]);
      return () => {
        setRegistered((prev) =>
          prev.filter((shortcut) => !shortcuts.includes(shortcut))
        );
      };
    },
    []
  );

  const closeOverlays = useCallback(() => {
    setShowCheatSheet(false);
    window.dispatchEvent(new CustomEvent(CLOSE_OVERLAYS_EVENT));
  }, []);

  const toggleCheatSheet = useCallback(
    () => setShowCheatSheet((open) => !open),
    []
  );

  const visibleShortcuts = useMemo<KeyboardShortcutDefinition[]>(
    () => [
      {
        keys: ["?"],
        description: "Open the keyboard shortcut cheat sheet",
        category: "global",
        action: toggleCheatSheet,
      },
      {
        keys: ["Escape"],
        description: "Close the open drawer, dialog or cheat sheet",
        category: "global",
        action: closeOverlays,
      },
      {
        keys: ["g", "h"],
        description: "Go to Dashboard",
        category: "navigation",
        action: () => router.push("/"),
      },
      {
        keys: ["g", "o"],
        description: "Go to Orders",
        category: "navigation",
        action: () => router.push("/orders"),
      },
      {
        keys: ["g", "w"],
        description: "Go to Wallet",
        category: "navigation",
        action: () => router.push("/wallet"),
      },
      {
        keys: ["g", "d"],
        description: "Go to Delegations",
        category: "navigation",
        action: () => router.push("/delegations"),
      },
    ],
    [router, toggleCheatSheet, closeOverlays]
  );

  const allShortcuts = useMemo(
    () => [...visibleShortcuts, ...registered],
    [visibleShortcuts, registered]
  );

  // Keep the latest shortcut set reachable from the stable listener without
  // re-subscribing (and thus reordering listeners) on every render.
  const shortcutsRef = useRef(allShortcuts);
  shortcutsRef.current = allShortcuts;

  useEffect(() => {
    function clearPending() {
      pendingRef.current = [];
      if (timerRef.current) clearTimeout(timerRef.current);
    }

    function onKeyDown(event: KeyboardEvent) {
      // Let inner (document-level) handlers win when they already acted.
      if (event.defaultPrevented) return;
      if (isTypingTarget(event.target)) {
        clearPending();
        return;
      }
      // Never shadow browser/OS shortcuts.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;

      const { run, pending } = resolveShortcut(
        shortcutsRef.current,
        event.key,
        pendingRef.current
      );

      pendingRef.current = pending;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pending.length > 0) {
        timerRef.current = setTimeout(clearPending, SEQUENCE_TIMEOUT_MS);
      }

      if (run) {
        event.preventDefault();
        run.action();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const value = useMemo<GlobalShortcutsContextValue>(
    () => ({
      shortcuts: allShortcuts,
      registerShortcuts,
      showCheatSheet,
      setShowCheatSheet,
    }),
    [allShortcuts, registerShortcuts, showCheatSheet]
  );

  return (
    <GlobalShortcutsContext.Provider value={value}>
      {children}
      {showCheatSheet && (
        <ShortcutCheatSheet
          shortcuts={allShortcuts}
          onClose={() => setShowCheatSheet(false)}
        />
      )}
    </GlobalShortcutsContext.Provider>
  );
}
