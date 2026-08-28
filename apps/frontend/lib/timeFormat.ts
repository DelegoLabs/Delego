/**
 * Timezone / clock-format preference definitions (#608).
 *
 * Mirrors lib/currencies.ts / lib/networks.ts: the active choice is
 * persisted in localStorage and shared through TimeFormatProvider (see
 * hooks/useTimeFormat.tsx). Owns *time* display only — the display-currency
 * preference (hooks/useCurrency.tsx) owns *money* formatting; the two never
 * need to coordinate since neither touches the other's inputs.
 */

export type ClockFormat = "12h" | "24h";

/** ISO 8601 weekday numbering: 1 = Monday … 7 = Sunday. */
export type FirstDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TimeFormatPreferences {
  /** IANA timezone name (e.g. "America/New_York"), or "auto" to follow the browser's timezone. */
  timezone: string;
  clockFormat: ClockFormat;
  firstDayOfWeek: FirstDayOfWeek;
}

export const AUTO_TIMEZONE = "auto";

export const DEFAULT_TIME_FORMAT_PREFERENCES: TimeFormatPreferences = {
  timezone: AUTO_TIMEZONE,
  clockFormat: "24h",
  firstDayOfWeek: 1,
};

/** localStorage key holding the user's timezone/clock-format selection. */
export const TIME_FORMAT_STORAGE_KEY = "delego_time_format_preferences";

/** The browser's IANA timezone, resolved once at module load. */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** Resolves "auto" to the browser's actual timezone; passes any explicit choice through. */
export function resolveTimezone(timezone: string): string {
  return timezone === AUTO_TIMEZONE ? getBrowserTimezone() : timezone;
}

/**
 * A representative list of IANA timezones for the settings searchable list.
 * Deliberately not exhaustive (the full IANA database is ~400 entries) —
 * covers major population centers per UTC offset band. `Intl.DateTimeFormat`
 * itself accepts any valid IANA name even if it's not in this list, so a
 * user arriving with a persisted value outside this list still works.
 */
export const COMMON_TIMEZONES: readonly string[] = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export function isValidTimezone(value: string): boolean {
  if (value === AUTO_TIMEZONE) return true;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isClockFormat(value: string): value is ClockFormat {
  return value === "12h" || value === "24h";
}

export function isFirstDayOfWeek(value: number): value is FirstDayOfWeek {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

/** Type guard + shape check for a value read back from localStorage. */
export function isTimeFormatPreferences(
  value: unknown
): value is TimeFormatPreferences {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.timezone === "string" &&
    isValidTimezone(v.timezone) &&
    typeof v.clockFormat === "string" &&
    isClockFormat(v.clockFormat) &&
    typeof v.firstDayOfWeek === "number" &&
    isFirstDayOfWeek(v.firstDayOfWeek)
  );
}
