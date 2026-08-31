import type { TimeFormatPreferences } from "./timeFormat";
import { resolveTimezone } from "./timeFormat";

/**
 * Shared Intl.DateTimeFormat / Intl.NumberFormat helpers (#556 FE-049).
 *
 * Centralizes locale-aware formatting so date/number display follows the
 * user's selected app language (see components/settings/LanguageSwitcher)
 * rather than only the browser's default locale. Pass the active locale from
 * `useLocale()` in client components; server components can use `getLocale()`.
 *
 * formatDate/formatDateTime/formatNumber are locale-only and intentionally
 * don't take a timezone — most existing call sites (e.g. an order's creation
 * date, where only the day matters) don't need one. The `WithPreferences`
 * variants below (#608) add timezone + 12h/24h control for call sites that
 * do — see docs/architecture/TIME_FORMAT_SWEEP.md for which call sites have
 * been converted so far.
 */

export function formatDate(
  date: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }
): string {
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatDateTime(
  date: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  }
): string {
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Timezone- and clock-format-aware date/time formatting (#608). Takes the
 * preference object from `useTimeFormat()` directly so call sites don't need
 * to thread `effectiveTimezone`/`clockFormat` through separately.
 */
export function formatDateTimeWithPreferences(
  date: Date,
  locale: string,
  preferences: TimeFormatPreferences,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  }
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: resolveTimezone(preferences.timezone),
    hour12: preferences.clockFormat === "12h",
  }).format(date);
}

/** Time-only formatting (no date portion), honoring timezone + 12h/24h. */
export function formatTimeWithPreferences(
  date: Date,
  locale: string,
  preferences: TimeFormatPreferences
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: resolveTimezone(preferences.timezone),
    hour12: preferences.clockFormat === "12h",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Full date + time, honoring timezone + 12h/24h. */
export function formatFullDateTimeWithPreferences(
  date: Date,
  locale: string,
  preferences: TimeFormatPreferences
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: resolveTimezone(preferences.timezone),
    hour12: preferences.clockFormat === "12h",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const RELATIVE_TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

/**
 * "2h ago" / "in 3 days" style relative time, locale-aware via
 * Intl.RelativeTimeFormat. Timezone doesn't affect the *value* of a
 * relative-time calculation (it's a pure elapsed-time diff, not a wall-clock
 * read), so this doesn't take a timezone — only locale, for the unit labels
 * ("hours" vs "heures") and numbering. Falls back to "just now" for
 * differences under a minute, matching the previous ad-hoc implementation in
 * NotificationCenter.tsx.
 */
export function formatRelativeTime(
  date: Date,
  locale: string,
  now: Date = new Date()
): string {
  const diffSec = Math.round((now.getTime() - date.getTime()) / 1000);
  const absDiffSec = Math.abs(diffSec);

  if (absDiffSec < 60) return "just now";

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, secondsInUnit] of RELATIVE_TIME_UNITS) {
    if (absDiffSec >= secondsInUnit) {
      const value = Math.round(diffSec / secondsInUnit);
      return rtf.format(-value, unit);
    }
  }
  return rtf.format(-Math.round(diffSec / 60), "minute");
}
