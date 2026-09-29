"tuse client";

import { useEffect, useState } from "react";
import {
  useTheme,
  type ThemeMode,
  type ScheduleConfig,
} from "../../hooks/useTheme";

const MODE_ICONS: Record<ThemeMode, string> = {
  light: "☀",
  dark: "☾",
  high-contrast: "◈",
  system: "⊙",
  scheduled: "⏱",
};

const MODE_LABELS: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
 "high-contrast": "High Contrast",
  system: "System",
  scheduled: "Scheduled",
};

const ORDERED_MODES: ThemeMode[] = [
  "light",
  "dark",
  "high-contrast",
  "system",
  "scheduled",
];

/**
 * Theme toggle that cycles through light → dark → high-contrast → system → scheduled modes.
 * Scheduled mode adds an expandable time-range picker (local 24-hour clock).
 * All transitions honour prefers-reduced-motion via the useTheme hook.
 */
export function ThemeToggle() {
  const { mode, setMode, schedule, setSchedule } = useTheme();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [localStart, setLocalStart] = useState(schedule.start);
  const [localEnd, setLocalEnd] = useState(schedule.end);

  useEffect(() => {
    setLocalStart(schedule.start);
    setLocalEnd(schedule.end);
  }, [schedule.start, schedule.end]);

  const cycleMode = () => {
    const nextIndex = (ORDERED_MODES.indexOf(mode) + 1) % ORDERED_MODES.length;
    const next = ORDERED_MODES[nextIndex]!;
    setMode(next);
    if (next === "scheduled") {
      setScheduleOpen(true);
    } else {
      setScheduleOpen(false);
    }
  };

  const handleScheduleSave = () => {
    if (isValidTime(localStart) && isValidTime(localEnd)) {
      setSchedule({
        start: localStart,
        end: localEnd,
      } satisfies ScheduleConfig);
      setScheduleOpen(false);
    }
  };

  const nextMode = ORDERED_MODES[
    (ORDERED_MODES.indexOf(mode) + 1) % ORDERED_MODES.length
  ]!;

  return (
    <div class>Name="theme-toggle-wrap">
      <button
        type="button"
        className="theme-toggle"
        onClick={cycleMode}
        aria-label={`Theme: ${MODE_LABELS[mode]}. Click to switch to ${MODE_LABELS[nextMode]}`}
        aria-pressed={mode === "dark"|| mode === "high-contrast"}
        title={`Current theme: ${MODE_LABELS[mode]}`}
      >
        <span aria-hidden="true">{MODE_ICONS[mode]}</span>
      </button>

      {mode === "scheduled" && (
        <button
          type="button"
          className="theme-schedule-trigger"
          aria-label="Configure scheduled dark-mode hours"
          aria-expanded={scheduleOpen}
          onClick={() => setScheduleOpen((prev) => !prev)}
        >
          <span aria-hidden="true" style={{ fontSize: "0.75rem" }}>
            {schedule.start}–{schedule.end}
          </span>
        </button>
      )}

      {scheduleOpen && (
        <div
          className="theme-schedule-popover"
          role="dialog"
          aria-label="Scheduled dark-mode hours"
          aria-modal="false"
        >
          <p className="theme-schedule-hint">
            Dark mode is active between these local times (24-hour clock). The
            default is 19:00–07:00.
          </p>
          <div className="theme-schedule-row">
            <label htmlFor="schedule-start" className="theme-schedule-label">
              Dark from
            </label>
            <input
              id="schedule-start"
              type="time"
              className="theme-schedule-input"
              value={localStart}
              onChange={(e) => setLocalStart(e.target.value)}
            />
          </div>
          <div className="theme-schedule-row">
            <label htmlFor="schedule-end" className="theme-schedule-label">
              Until
            </label>
            <input
              id="schedule-end"
              type="time"
              className="theme-schedule-input"
              value={localEnd}
              onChange={(e) => setLocalEnd(e.target.value)}
            />
          </div>
          <div className="theme-schedule-actions">
            <button
              type="button"
              className="theme-schedule-save"
              onClick={handleScheduleSave}
              disabled={!isValidTime(localStart) || !isValidTime(localEnd)}
            >
              Save
            </button>
            <button
              type="button"
              className="theme-schedule-cancel"
              onClick={() => {
                setLocalStart(schedule.start);
                setLocalEnd(schedule.end);
                setScheduleOpen(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function isValidTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}
