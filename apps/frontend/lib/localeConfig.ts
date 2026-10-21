/**
 * Display locale configuration (Issue #1 — Internationalization & locale
 * switching).
 *
 * This is deliberately separate from next-intl's message catalogue
 * (`i18n/config.ts`, currently `en`/`de`): that layer translates *copy*,
 * whereas this one drives *formatting* — number separators, currency
 * placement and relative timestamps — via the `Intl.*` wrappers in
 * `lib/formatters.ts` and the active preference held by
 * `hooks/useLocalePreference.tsx`.
 *
 * To add a language: append a `LocaleConfig` below. Set `rtl: true` for
 * right-to-left scripts (e.g. `ar`/`he`) — the provider then flips the
 * document `dir` and `styles/globals.css` applies the matching logical
 * layout adjustments, so no component needs to branch on direction.
 */

/** BCP-47 locale tags offered by the footer locale switcher. */
export type SupportedLocale = "en-US" | "es-ES" | "fr-FR" | "ja-JP";

export interface LocaleConfig {
  locale: SupportedLocale;
  /** Endonym shown in the switcher (e.g. "Français", not "French"). */
  languageName: string;
  flagEmoji: string;
  /** True for right-to-left scripts; drives document direction + CSS. */
  rtl: boolean;
}

/** Ordered list of locales surfaced in the footer switcher. */
export const SUPPORTED_LOCALES: readonly LocaleConfig[] = [
  { locale: "en-US", languageName: "English", flagEmoji: "🇺🇸", rtl: false },
  { locale: "es-ES", languageName: "Español", flagEmoji: "🇪🇸", rtl: false },
  { locale: "fr-FR", languageName: "Français", flagEmoji: "🇫🇷", rtl: false },
  { locale: "ja-JP", languageName: "日本語", flagEmoji: "🇯🇵", rtl: false },
];

/** Locale used until the visitor explicitly picks one. */
export const DEFAULT_LOCALE: SupportedLocale = "en-US";

/** localStorage key holding the persisted locale preference. */
export const LOCALE_STORAGE_KEY = "delego_locale_preference";

/** Type guard for values read back from localStorage / cookies. */
export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    SUPPORTED_LOCALES.some((config) => config.locale === value)
  );
}

/** Config for a locale, falling back to the default when unknown. */
export function getLocaleConfig(locale: SupportedLocale): LocaleConfig {
  return (
    SUPPORTED_LOCALES.find((config) => config.locale === locale) ??
    SUPPORTED_LOCALES[0]
  );
}

/** Whether the locale is written right-to-left. */
export function isRtlLocale(locale: SupportedLocale): boolean {
  return getLocaleConfig(locale).rtl;
}

/** Text direction for a locale, ready for `<html dir>` / `[dir]` CSS. */
export function getLocaleDirection(locale: SupportedLocale): "ltr" | "rtl" {
  return isRtlLocale(locale) ? "rtl" : "ltr";
}
