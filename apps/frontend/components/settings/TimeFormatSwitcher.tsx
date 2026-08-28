"use client";

import { Card } from "@delegolabs/ui";
import { useTimeFormat } from "../../hooks/useTimeFormat";
import {
  AUTO_TIMEZONE,
  COMMON_TIMEZONES,
  getBrowserTimezone,
  isClockFormat,
  isFirstDayOfWeek,
  type ClockFormat,
  type FirstDayOfWeek,
} from "../../lib/timeFormat";

const CLOCK_FORMAT_LABELS: Record<ClockFormat, string> = {
  "12h": "12-hour (2:30 PM)",
  "24h": "24-hour (14:30)",
};

const FIRST_DAY_LABELS: Record<FirstDayOfWeek, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

const FIRST_DAY_OPTIONS: FirstDayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * Timezone / clock-format / first-day-of-week preference switcher (#608).
 * Mirrors components/settings/CurrencySwitcher.tsx: a Card-wrapped set of
 * controls persisted via TimeFormatProvider (localStorage), reactive without
 * a reload since every consumer reads through useTimeFormat().
 */
export function TimeFormatSwitcher() {
  const { preferences, effectiveTimezone, setPreferences, hydrated } =
    useTimeFormat();

  function handleTimezoneChange(next: string) {
    setPreferences({ ...preferences, timezone: next });
  }

  function handleClockFormatChange(next: string) {
    if (isClockFormat(next)) {
      setPreferences({ ...preferences, clockFormat: next });
    }
  }

  function handleFirstDayChange(next: string) {
    const parsed = Number(next);
    if (isFirstDayOfWeek(parsed)) {
      setPreferences({ ...preferences, firstDayOfWeek: parsed });
    }
  }

  return (
    <Card title="Time & date" ariaLabel="Time and date preferences">
      <div className="settings-section">
        <label
          htmlFor="timezone-select"
          style={{ display: "block", fontWeight: 500, marginBottom: "0.5rem" }}
        >
          Timezone
        </label>
        <p style={{ fontSize: "0.875rem", color: "#666", margin: "0 0 0.5rem" }}>
          {preferences.timezone === AUTO_TIMEZONE
            ? `Following your device (${hydrated ? effectiveTimezone : getBrowserTimezone()})`
            : "All timestamps are shown in the selected timezone."}
        </p>
        <select
          id="timezone-select"
          value={preferences.timezone}
          onChange={(e) => handleTimezoneChange(e.target.value)}
          style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem" }}
        >
          <option value={AUTO_TIMEZONE}>Auto (device timezone)</option>
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-section">
        <label
          htmlFor="clock-format-select"
          style={{ display: "block", fontWeight: 500, marginBottom: "0.5rem" }}
        >
          Clock format
        </label>
        <select
          id="clock-format-select"
          value={preferences.clockFormat}
          onChange={(e) => handleClockFormatChange(e.target.value)}
          style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem" }}
        >
          {(Object.keys(CLOCK_FORMAT_LABELS) as ClockFormat[]).map((fmt) => (
            <option key={fmt} value={fmt}>
              {CLOCK_FORMAT_LABELS[fmt]}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-section">
        <label
          htmlFor="first-day-select"
          style={{ display: "block", fontWeight: 500, marginBottom: "0.5rem" }}
        >
          First day of week
        </label>
        <select
          id="first-day-select"
          value={preferences.firstDayOfWeek}
          onChange={(e) => handleFirstDayChange(e.target.value)}
          style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem" }}
        >
          {FIRST_DAY_OPTIONS.map((day) => (
            <option key={day} value={day}>
              {FIRST_DAY_LABELS[day]}
            </option>
          ))}
        </select>
      </div>
    </Card>
  );
}
