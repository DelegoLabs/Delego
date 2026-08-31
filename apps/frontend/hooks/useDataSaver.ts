"use client";

import { useCallback, useEffect, useState } from "react";

export type DataSaverMode = "auto" | "on" | "off";

/** Minimal shape of the Network Information API this hook reads. */
interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
}

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike;
  mozConnection?: NetworkInformationLike;
  webkitConnection?: NetworkInformationLike;
};

const STORAGE_KEY = "delego-data-saver-mode";

/** Connection types treated as slow enough to auto-enable reduced mode. */
const SLOW_EFFECTIVE_TYPES = new Set(["slow-2g", "2g"]);

function getConnection(): NetworkInformationLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  const nav = navigator as NavigatorWithConnection;
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
}

/** Whether the browser's own network hints suggest a metered/slow connection. */
function detectSlowConnection(): boolean {
  const connection = getConnection();
  if (!connection) return false;
  if (connection.saveData) return true;
  if (connection.effectiveType && SLOW_EFFECTIVE_TYPES.has(connection.effectiveType)) {
    return true;
  }
  return false;
}

function readStoredMode(): DataSaverMode {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "on" || raw === "off" || raw === "auto" ? raw : "auto";
  } catch {
    return "auto";
  }
}

export interface UseDataSaverReturn {
  /** The user's stored preference: "auto" (follow the connection), "on", or "off". */
  mode: DataSaverMode;
  /**
   * Whether reduced mode is actually active right now — `mode === "on"`,
   * or `mode === "auto"` and the connection looks slow/metered.
   */
  reducedModeActive: boolean;
  setMode: (mode: DataSaverMode) => void;
}

/**
 * Network-aware "data saver" mode (#623): detects `navigator.connection`'s
 * `saveData` flag / `effectiveType` to suggest reduced page weight (image
 * placeholders, chart summaries instead of full renders, no prefetch), with
 * a manual override that persists across reloads and always wins over the
 * heuristic.
 */
export function useDataSaver(): UseDataSaverReturn {
  const [mode, setModeState] = useState<DataSaverMode>("auto");
  const [connectionIsSlow, setConnectionIsSlow] = useState(false);

  useEffect(() => {
    setModeState(readStoredMode());
    setConnectionIsSlow(detectSlowConnection());

    const connection = getConnection();
    if (!connection?.addEventListener) return;

    const handleChange = () => setConnectionIsSlow(detectSlowConnection());
    connection.addEventListener("change", handleChange);
    return () => connection.removeEventListener?.("change", handleChange);
  }, []);

  const setMode = useCallback((next: DataSaverMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const reducedModeActive = mode === "on" || (mode === "auto" && connectionIsSlow);

  return { mode, reducedModeActive, setMode };
}
