"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_CONSENT_PREFERENCES,
  getConsentPreferences,
  getConsentLog,
  setConsentPreferences,
  type ConsentPreferences,
  type ConsentLogEntry,
} from "../lib/consent";

export interface UseConsentResult {
  preferences: ConsentPreferences;
  log: ConsentLogEntry[];
  /** Updates one category and applies immediately (mid-session, no reload needed). */
  setCategory: (category: "productAnalytics" | "marketing", granted: boolean) => void;
}

/**
 * Settings -> Privacy read/write access to consent preferences and their
 * audit log (#612). Preferences are read once at mount (SSR-safe: starts
 * from the essential-only default, then syncs from localStorage in an
 * effect) and every `setCategory` call re-reads `getConsentLog()` so the
 * log view reflects the change immediately.
 */
export function useConsent(): UseConsentResult {
  const [preferences, setPreferences] = useState<ConsentPreferences>(
    DEFAULT_CONSENT_PREFERENCES
  );
  const [log, setLog] = useState<ConsentLogEntry[]>([]);

  useEffect(() => {
    setPreferences(getConsentPreferences() ?? DEFAULT_CONSENT_PREFERENCES);
    setLog(getConsentLog());
  }, []);

  const setCategory = useCallback(
    (category: "productAnalytics" | "marketing", granted: boolean) => {
      const current = getConsentPreferences() ?? DEFAULT_CONSENT_PREFERENCES;
      const updated = setConsentPreferences(
        {
          productAnalytics:
            category === "productAnalytics" ? granted : current.productAnalytics,
          marketing: category === "marketing" ? granted : current.marketing,
        },
        "settings"
      );
      setPreferences(updated);
      setLog(getConsentLog());
    },
    []
  );

  return { preferences, log, setCategory };
}
