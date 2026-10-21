/**
 * Locale-aware formatting helpers (Issue #1).
 *
 * Thin, pure wrappers around the platform `Intl.NumberFormat`,
 * `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat` so every caller shares
 * one implementation and tests can assert formatted output per locale. Each
 * helper falls back gracefully (returning a best-effort string) when handed an
 * invalid value or an unsupported option, so a formatter bug can never crash a
 * render.
 */

import { DEFAULT_LOCALE, type SupportedLocale } from "./localeConfig";

/** Anything the Date constructor accepts. */
export type DateInput = Date | number | string;

function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Locale-aware number, e.g. `1234567.89` → "1,234,567.89" (en-US). */
export function formatNumber(
  value: number,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions
): string {
  if (!Number.isFinite(value)) return String(value);
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return String(value);
  }
}

/** Locale-aware currency, e.g. `1234.5` USD → "$1,234.50" (en-US). */
export function formatCurrency(
  value: number,
  currency: string,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions
): string {
  if (!Number.isFinite(value)) return String(value);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      ...options,
    }).format(value);
  } catch {
    return String(value);
  }
}

/** Locale-aware percentage, e.g. `0.25` → "25%" (en-US). */
export function formatPercent(
  value: number,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions
): string {
  if (!Number.isFinite(value)) return String(value);
  try {
    return new Intl.NumberFormat(locale, {
      style: "percent",
      ...options,
    }).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Locale-aware relative time, e.g. `formatRelativeTime(-1, "day", "en-US")`
 * → "1 day ago".
 */
export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options?: Intl.RelativeTimeFormatOptions
): string {
  try {
    return new Intl.RelativeTimeFormat(locale, {
      numeric: "auto",
      ...options,
    }).format(value, unit);
  } catch {
    return `${value} ${unit}`;
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Picks the most readable unit for a timestamp relative to `now` and formats
 * it. Used for "3 minutes ago" / "in 2 days" style timestamps.
 */
export function formatRelativeToNow(
  timestamp: DateInput,
  locale: SupportedLocale = DEFAULT_LOCALE,
  now: DateInput = Date.now()
): string {
  const date = toDate(timestamp);
  const reference = toDate(now);
  if (!date || !reference) return "";

  const deltaMs = date.getTime() - reference.getTime();
  const abs = Math.abs(deltaMs);

  if (abs < MINUTE) {
    return formatRelativeTime(Math.round(deltaMs / 1000), "second", locale);
  }
  if (abs < HOUR) {
    return formatRelativeTime(Math.round(deltaMs / MINUTE), "minute", locale);
  }
  if (abs < DAY) {
    return formatRelativeTime(Math.round(deltaMs / HOUR), "hour", locale);
  }
  if (abs < WEEK) {
    return formatRelativeTime(Math.round(deltaMs / DAY), "day", locale);
  }
  if (abs < MONTH) {
    return formatRelativeTime(Math.round(deltaMs / WEEK), "week", locale);
  }
  if (abs < YEAR) {
    return formatRelativeTime(Math.round(deltaMs / MONTH), "month", locale);
  }
  return formatRelativeTime(Math.round(deltaMs / YEAR), "year", locale);
}

/** Locale-aware date + time, e.g. "01/02/2026, 14:30" (en-US). */
export function formatDateTime(
  value: DateInput,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = toDate(value);
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      ...options,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/** Locale-aware date only. */
export function formatDate(
  value: DateInput,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = toDate(value);
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      ...options,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** The formatting surface bound to a single locale. */
export interface LocaleFormatters {
  formatNumber: (
    value: number,
    options?: Intl.NumberFormatOptions
  ) => string;
  formatCurrency: (
    value: number,
    currency: string,
    options?: Intl.NumberFormatOptions
  ) => string;
  formatPercent: (
    value: number,
    options?: Intl.NumberFormatOptions
  ) => string;
  formatRelativeTime: (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions
  ) => string;
  formatRelativeToNow: (
    timestamp: DateInput,
    now?: DateInput
  ) => string;
  formatDateTime: (
    value: DateInput,
    options?: Intl.DateTimeFormatOptions
  ) => string;
  formatDate: (
    value: DateInput,
    options?: Intl.DateTimeFormatOptions
  ) => string;
}

/** Builds the formatter set bound to `locale` (memoise per locale). */
export function createLocaleFormatters(
  locale: SupportedLocale = DEFAULT_LOCALE
): LocaleFormatters {
  return {
    formatNumber: (value, options) => formatNumber(value, locale, options),
    formatCurrency: (value, currency, options) =>
      formatCurrency(value, currency, locale, options),
    formatPercent: (value, options) => formatPercent(value, locale, options),
    formatRelativeTime: (value, unit, options) =>
      formatRelativeTime(value, unit, locale, options),
    formatRelativeToNow: (timestamp, now) =>
      formatRelativeToNow(timestamp, locale, now),
    formatDateTime: (value, options) => formatDateTime(value, locale, options),
    formatDate: (value, options) => formatDate(value, locale, options),
  };
}
