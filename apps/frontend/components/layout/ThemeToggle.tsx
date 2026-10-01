"use client";

import { useEffect, useState } from "react";

/**
 * Theme modes supported by the toggle.
 * - light / dark / high-contrast are explicit selections.
 * - system delegates to the OS color-scheme preference.
 * - scheduled automatically applies dark within a time window.
 */
export type ThemeMode = "light" | "dark" | "high-contrast" | "system" | "scheduled";

export type ResolvedTheme = "light" | "dark" | "high-contrast";

export interface ScheduleConfig {
  start: string;
  end: string;
}

export interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme(theme: ThemeMode): void;
}

const STORAGE_KEY = "theme-mode";
const SCHEDULE_STORAGE_KEY = "theme-schedule";
const DEFAULT_SCHEDULE: ScheduleConfig = { start: "19:00", end: "07:00" };

const MODE_ICONS: Record<ThemeMode, string> = {
  light: "☀",
  dark: "☾",
  "high-contrast": "◈",
  system: "≠",
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

function isValidTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function isWithinSchedule(schedule: ScheduleConfig, now: Date = new Date()): boolean {
  if (!isValidTime(schedule.start) || !isValidTime(schedule.end)) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = schedule.start.split(":").map(Number) as [number, number];
  const [eh, em] = schedule.end.split(":").map(Number) as [number, number];
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return current >= startMinutes && current < endMinutes;
  }
  // Overnight window (e.g. 19:00-07:00).
  return current >= startMinutes || current < endMinutes;
}

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (
      stored === "light" ||
      stored === "dark" ||
      stored === "high-contrast" ||
      stored === "system" ||
      stored === "scheduled"
    ) {
      return stored;
    }
  } catch {
    // Ignore private mode / storage errors.
  }
  return "system";
}

function readStoredSchedule(): ScheduleConfig {
  if (typeof window === "undefined") return DEFAULT_SCHEDULE;
  try {
    const stored = window.localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ScheduleConfig>;
      if (
        typeof parsed.start === "string" &&
        typeof parsed.end === "string" &&
        isValidTime(parsed.start) &&
        isValidTime(parsed.end)
      ) {
        return { start: parsed.start, end: parsed.end };
      }
    }
  } catch {
    // Ignore corrupted storage.
  }
  return DEFAULT_SCHEDULE;
}

function applyResolvedTheme(theme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "high-contrast");
  if (theme === "dark") root.classList.add("dark");
  if (theme === "high-contrast") {
    root.classList.add("high-contrast");
  }
  root.style.colorScheme = theme === "light" ? "light" : "dark";
  root.dataset.theme = theme;
}

/**
 * Theme toggle that cycles through light → dark → high-contrast → system → scheduled modes.
 * Scheduled mode adds an expandable time-range picker (local 24-hour clock).
 * All transitions honour prefers-reduced-motion via CSS media queries.
 */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [schedule, setSchedule] = useState<ScheduleConfig>(DEFAULT_SCHEDULE);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [localStart, setLocalStart] = useState(DEFAULT_SCHEDULE.start);
  const [localEnd, setLocalEnd] = useState(DEFAULT_SCHEDULE.end);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  // Hydrate from localStorage once on mount. The inline script in the document
  // head already applied the correct class to <html> to prevent FOUC.
  useEffect(() => {
    const storedTheme = readStoredTheme();
    const storedSchedule = readStoredSchedule();
    setMode(storedTheme);
    setSchedule(storedSchedule);
    setLocalStart(storedSchedule.start);
    setLocalEnd(storedSchedule.end);
  }, []);

  // Resolve the effective theme and apply it to <html>.
  useEffect(() => {
    let next: ResolvedTheme;
    if (mode === "system") {
      next = getSystemTheme();
    } else if (mode === "scheduled") {
      next = isWithinSchedule(schedule) ? "dark" : "light";
    } else {
      next = mode;
    }
    setResolvedTheme(next);
    applyResolvedTheme(next);
  }, [mode, schedule]);

  // React to OS color-scheme changes when in system mode.
  useEffect(() => {
    if (mode !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const next = getSystemTheme();
      setResolvedTheme(next);
      applyResolvedTheme(next);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  // Re-evaluate the schedule periodically so the theme flips at the boundaries.
  useEffect(() => {
    if (mode !== "scheduled") return;
    const id = window.setInterval(() => {
      const next: ResolvedTheme = isWithinSchedule(schedule) ? "dark" : "light";
      setResolvedTheme(next);
      applyResolvedTheme(next);
    }, 60_000);
    return () => window.clearInterval(id);
  }, [mode, schedule]);

  const persistMode = (next: ThemeMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage errors.
    }
  };

  const cycleMode = () => {
    const nextIndex = (ORDERED_MODES.indexOf(mode) + 1) % ORDERED_MODES.length;
    const next = ORDERED_MODES[nextIndex]!;
    persistMode(next);
    if (next === "scheduled") {
      setScheduleOpen(true);
    } else {
      setScheduleOpen(false);
    }
  };

  const handleScheduleSave = () => {
    if (isValidTime(localStart) && isValidTime(localEnd)) {
      const next = { start: localStart, end: localEnd } satisfies ScheduleConfig;
      setSchedule(next);
      try {
        window.localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors.
      }
      setScheduleOpen(false);
    }
  };

  const nextMode = ORDERED_MODES[(ORDERED_MODES.indexOf(mode) + 1) % ORDERED_MODES.length]!;

  return (
    <div className="theme-toggle-wrap">
      <button
        type="button"
        className="theme-toggle"
        onClick={cycleMode}
        aria-label={`Theme: ${MODE_LABELS[mode]}. Click to switch to ${MODE_LABELS[nextMode]}`}
        aria-pressed={resolvedTheme !== "light"}
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
