"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_TIME_FORMAT_PREFERENCES,
  isTimeFormatPreferences,
  resolveTimezone,
  TIME_FORMAT_STORAGE_KEY,
  type TimeFormatPreferences,
} from "../lib/timeFormat";

interface TimeFormatContextValue {
  /** The raw preference (timezone may be "auto") */
  preferences: TimeFormatPreferences;
  /** preferences.timezone with "auto" resolved to the browser's actual IANA timezone */
  effectiveTimezone: string;
  /** Replace the full preference set (persisted to localStorage) */
  setPreferences: (next: TimeFormatPreferences) => void;
  /** True once the persisted value has been read on the client */
  hydrated: boolean;
}

const TimeFormatContext = createContext<TimeFormatContextValue | null>(null);

/**
 * Provides the active timezone / clock-format / first-day-of-week
 * preferences to the whole app (#608).
 *
 * Mirrors hooks/useCurrency.tsx and hooks/useNetwork.tsx: persisted in
 * localStorage, read after mount to avoid hydration drift (the server
 * always renders with the "auto" default since it can't know the visitor's
 * timezone), and synced across tabs via the `storage` event.
 */
export function TimeFormatProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferencesState] = useState<TimeFormatPreferences>(
    DEFAULT_TIME_FORMAT_PREFERENCES
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(TIME_FORMAT_STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isTimeFormatPreferences(parsed)) {
          setPreferencesState(parsed);
        }
      }
    } catch {
      // localStorage may be unavailable, or hold malformed JSON — keep the default.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== TIME_FORMAT_STORAGE_KEY || !event.newValue) return;
      try {
        const parsed: unknown = JSON.parse(event.newValue);
        if (isTimeFormatPreferences(parsed)) {
          setPreferencesState(parsed);
        }
      } catch {
        // Ignore malformed values written by another tab.
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPreferences = useCallback((next: TimeFormatPreferences) => {
    setPreferencesState(next);
    try {
      window.localStorage.setItem(
        TIME_FORMAT_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {
      // Ignore persistence failures — the in-memory value still updates.
    }
  }, []);

  const value = useMemo<TimeFormatContextValue>(
    () => ({
      preferences,
      effectiveTimezone: resolveTimezone(preferences.timezone),
      setPreferences,
      hydrated,
    }),
    [preferences, setPreferences, hydrated]
  );

  return (
    <TimeFormatContext.Provider value={value}>
      {children}
    </TimeFormatContext.Provider>
  );
}

/** Access the active timezone/clock-format preferences. Must be used within a TimeFormatProvider. */
export function useTimeFormat(): TimeFormatContextValue {
  const ctx = useContext(TimeFormatContext);
  if (!ctx) {
    throw new Error("useTimeFormat must be used within a TimeFormatProvider");
  }
  return ctx;
}
