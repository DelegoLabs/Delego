"use client";

import { useCallback, useEffect, useState } from "react";

export type ReduceMotionMode = "on" | "off" | "system";

export interface A11yPreferences {
  /** Root font size percentage: 90% to 150%. Default: 100 */
  textScale: number;
  /** Forced high-contrast theme override. Default: false */
  highContrast: boolean;
  /** Reduce-motion override: "on" | "off" | "system". Default: "system" */
  reduceMotion: ReduceMotionMode;
  /** Always underline text links. Default: false */
  underlineLinks: boolean;
}

export const DEFAULT_A11Y_PREFERENCES: A11yPreferences = {
  textScale: 100,
  highContrast: false,
  reduceMotion: "system",
  underlineLinks: false,
};

const STORAGE_KEY = "delego-a11y-prefs";

function readStoredPreferences(): A11yPreferences {
  if (typeof window === "undefined") return DEFAULT_A11Y_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_A11Y_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<A11yPreferences>;
    return {
      textScale:
        typeof parsed.textScale === "number" &&
        parsed.textScale >= 90 &&
        parsed.textScale <= 150
          ? parsed.textScale
          : DEFAULT_A11Y_PREFERENCES.textScale,
      highContrast: Boolean(parsed.highContrast),
      reduceMotion:
        parsed.reduceMotion === "on" ||
        parsed.reduceMotion === "off" ||
        parsed.reduceMotion === "system"
          ? parsed.reduceMotion
          : DEFAULT_A11Y_PREFERENCES.reduceMotion,
      underlineLinks: Boolean(parsed.underlineLinks),
    };
  } catch {
    return DEFAULT_A11Y_PREFERENCES;
  }
}

function applyPreferences(prefs: A11yPreferences): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.style.fontSize = `${prefs.textScale}%`;
  html.dataset.highContrast = prefs.highContrast ? "true" : "false";
  html.dataset.reduceMotion = prefs.reduceMotion;
  html.dataset.underlineLinks = prefs.underlineLinks ? "true" : "false";
}

export interface UseA11yReturn {
  preferences: A11yPreferences;
  setTextScale: (scale: number) => void;
  setHighContrast: (enabled: boolean) => void;
  setReduceMotion: (mode: ReduceMotionMode) => void;
  setUnderlineLinks: (enabled: boolean) => void;
  resetToDefaults: () => void;
}

export function useA11y(): UseA11yReturn {
  const [preferences, setPreferencesState] = useState<A11yPreferences>(
    DEFAULT_A11Y_PREFERENCES
  );

  useEffect(() => {
    const stored = readStoredPreferences();
    setPreferencesState(stored);
    applyPreferences(stored);
  }, []);

  const updatePreferences = useCallback(
    (updater: (prev: A11yPreferences) => A11yPreferences) => {
      setPreferencesState((prev) => {
        const next = updater(prev);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        applyPreferences(next);
        return next;
      });
    },
    []
  );

  const setTextScale = useCallback(
    (scale: number) => {
      const clamped = Math.min(150, Math.max(90, Math.round(scale)));
      updatePreferences((prev) => ({ ...prev, textScale: clamped }));
    },
    [updatePreferences]
  );

  const setHighContrast = useCallback(
    (highContrast: boolean) => {
      updatePreferences((prev) => ({ ...prev, highContrast }));
    },
    [updatePreferences]
  );

  const setReduceMotion = useCallback(
    (reduceMotion: ReduceMotionMode) => {
      updatePreferences((prev) => ({ ...prev, reduceMotion }));
    },
    [updatePreferences]
  );

  const setUnderlineLinks = useCallback(
    (underlineLinks: boolean) => {
      updatePreferences((prev) => ({ ...prev, underlineLinks }));
    },
    [updatePreferences]
  );

  const resetToDefaults = useCallback(() => {
    updatePreferences(() => DEFAULT_A11Y_PREFERENCES);
  }, [updatePreferences]);

  return {
    preferences,
    setTextScale,
    setHighContrast,
    setReduceMotion,
    setUnderlineLinks,
    resetToDefaults,
  };
}

/**
 * Pre-hydration inline bootstrap script string to set root font-size and data
 * attributes before React hydrates, avoiding layout and visual flash.
 */
export const a11yBootstrapScript = /* js */ `
(function(){
  try {
    var raw = localStorage.getItem('delego-a11y-prefs');
    var p = raw ? JSON.parse(raw) : {};
    var scale = (typeof p.textScale === 'number' && p.textScale >= 90 && p.textScale <= 150) ? p.textScale : 100;
    var contrast = p.highContrast ? 'true' : 'false';
    var motion = (p.reduceMotion === 'on' || p.reduceMotion === 'off' || p.reduceMotion === 'system') ? p.reduceMotion : 'system';
    var underline = p.underlineLinks ? 'true' : 'false';
    document.documentElement.style.fontSize = scale + '%';
    document.documentElement.dataset.highContrast = contrast;
    document.documentElement.dataset.reduceMotion = motion;
    document.documentElement.dataset.underlineLinks = underline;
  } catch(e) {}
})();
`.trim();
