"use client";

import { SUPPORTED_LOCALES, type SupportedLocale } from "../../lib/localeConfig";
import { useLocalePreference } from "../../hooks/useLocalePreference";

/**
 * Footer locale switcher (Issue #1).
 *
 * A native `<select>` so keyboard interaction, screen-reader semantics and
 * mobile pickers work without bespoke ARIA. The choice is applied immediately
 * (no reload) via `useLocalePreference`, and persisted to localStorage.
 */
export function LocaleSelector() {
  const { locale, setLocale } = useLocalePreference();

  return (
    <div className="locale-selector">
      <label htmlFor="locale-select" className="locale-selector-label">
        Language
      </label>
      <select
        id="locale-select"
        className="locale-selector-select focus-visible-ring"
        value={locale}
        onChange={(event) => setLocale(event.target.value as SupportedLocale)}
        aria-label="Select display language"
      >
        {SUPPORTED_LOCALES.map((config) => (
          <option key={config.locale} value={config.locale}>
            {config.flagEmoji} {config.languageName}
          </option>
        ))}
      </select>
    </div>
  );
}
