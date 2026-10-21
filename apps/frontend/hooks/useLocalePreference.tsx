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
  DEFAULT_LOCALE,
  getLocaleConfig,
  getLocaleDirection,
  isSupportedLocale,
  LOCALE_STORAGE_KEY,
  type LocaleConfig,
  type SupportedLocale,
} from "../lib/localeConfig";
import {
  createLocaleFormatters,
  type LocaleFormatters,
} from "../lib/formatters";

interface LocaleContextValue extends LocaleFormatters {
  /** The active display locale. */
  locale: SupportedLocale;
  /** Full config (name, flag, direction) for the active locale. */
  config: LocaleConfig;
  /** "ltr" | "rtl" for the active locale. */
  direction: "ltr" | "rtl";
  /** Switch the active locale (persisted to localStorage). */
  setLocale: (locale: SupportedLocale) => void;
  /** True once the persisted value has been read on the client. */
  hydrated: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Provides the active display locale (Issue #1).
 *
 * Mirrors hooks/useCurrency.tsx and hooks/useTimeFormat.tsx: the preference is
 * persisted in localStorage, read after mount to avoid hydration drift (the
 * server always renders the default), and synced across tabs. Selecting a
 * locale updates every consumer's bound formatters immediately, and reflects
 * the choice onto `<html lang dir>` for assistive tech and RTL layout.
 */
export function LocalePreferenceProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isSupportedLocale(stored)) {
        setLocaleState(stored);
      }
    } catch {
      // localStorage may be unavailable (private mode) — keep the default.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== LOCALE_STORAGE_KEY) return;
      if (isSupportedLocale(event.newValue)) {
        setLocaleState(event.newValue);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Reflect the locale onto the document so CSS `[dir]` rules and assistive
  // tech (screen-reader pronunciation) follow the selection.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = getLocaleDirection(locale);
  }, [locale]);

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Ignore persistence failures — the in-memory value still updates.
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      config: getLocaleConfig(locale),
      direction: getLocaleDirection(locale),
      setLocale,
      hydrated,
      ...createLocaleFormatters(locale),
    }),
    [locale, setLocale, hydrated]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

/** Access the active display locale and its bound formatters. */
export function useLocalePreference(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error(
      "useLocalePreference must be used within a LocalePreferenceProvider"
    );
  }
  return ctx;
}
