// Issue #357 — i18n infrastructure for multi-language notification templates
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** A flat map of translation keys to translated strings. */
export type Translations = Record<string, string>;

/** The set of locales that have bundled translation files. */
export const SUPPORTED_LOCALES = ["en", "es", "fr"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Cache loaded translations to avoid repeated disk reads. */
const translationCache = new Map<string, Translations>();

/**
 * Load translations for the given locale from a JSON file on disk.
 *
 * Lookup order:
 *   1. Requested locale (e.g. `es`)
 *   2. English (`en`) — used as the authoritative fallback
 *
 * After loading, individual missing keys are filled in from English so callers
 * always receive a complete set of strings.
 */
export function loadTranslations(locale: string): Translations {
  // Normalise to lower-case to be lenient with input.
  const normalisedLocale = locale.toLowerCase();

  const cached = translationCache.get(normalisedLocale);
  if (cached) return cached;

  // English is the fallback of last resort; if the bundled `en.json` file is
  // missing or malformed we still need to return a usable (empty) dictionary
  // so the rest of the call chain can proceed without a nullable value.
  const enTranslations: Translations = _loadLocaleFile("en") ?? {};

  if (normalisedLocale === "en") {
    translationCache.set("en", enTranslations);
    return enTranslations;
  }

  // Attempt to load the requested locale; fall back to English on any error.
  let requested: Translations | null = null;
  if (SUPPORTED_LOCALES.includes(normalisedLocale as SupportedLocale)) {
    requested = _loadLocaleFile(normalisedLocale);
  }

  if (!requested) {
    // Unsupported or failed — just use English.
    translationCache.set(normalisedLocale, enTranslations);
    return enTranslations;
  }

  // Merge: fill any keys missing from the requested locale with English values.
  const merged: Translations = { ...enTranslations, ...requested };
  translationCache.set(normalisedLocale, merged);
  return merged;
}

/**
 * Replace `{{key}}` placeholders in `template` with values from `data`.
 * Placeholders that have no matching key in `data` are left unchanged.
 */
export function interpolate(
  template: string,
  data: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : `{{${key}}}`;
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _loadLocaleFile(locale: string): Translations | null {
  const filePath = resolve(__dirname, `${locale}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Translations;
  } catch {
    return null;
  }
}
