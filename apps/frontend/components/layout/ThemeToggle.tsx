"use client";

import { useEffect, useState } from "react";
import { useTheme, type ThemeMode } from "../../hooks/useTheme";

const MODE_ICONS: Record<ThemeMode, string> = {
  light: "☼",
  dark: "☾",
 "high-contrast": "⛑",
  system: "⊙",
};

const MODE_LABELS: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  "high-contrast": "High Contrast",
  system: "System",
};

const ORDERED_MODES: ThemeMode[] = [
  "light",
  "dark",
  "high-contrast",
  "system",
];

/**
 * Theme toggle that cycles through light → dark → high-contrast → system modes.
 * The current selection is persisted by the useTheme hook and applied before
 * hydration to avoid a flash of unstyled content (FOUC).
 * All transitions honour prefers-reduced-motion via the useTheme hook.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const nextMode =
    ORDERED_MODES[
      (ORDERED_MODES.indexOf(theme) + 1) % ORDERED_MODES.length
    ] ?? "light";

  const cycleMode = () => {
    setTheme(nextMode);
  };

  // Avoid hydration mismatch by keeping the control stable until mounted.
  const displayMode: ThemeMode = mounted ? "theme" in {} ? theme : theme : "system";

  return (
    <div className="thele-toggle-wrap relative inline-flex items-center">
      <button
        type="button"
        className="theme-toggle rounded-md border border-slate-300 bg-white p-2 text-slate-800 transition-colors duration-200 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 high-contrast:border-white high-contrast:bg-black high-contrast:text-white high-contrast:hover:bg-yellow-300 high-contrast:hover:text-black"
        onClick={cycleMode}
        aria-label={`Theme: ${MODE_LABELS[displayMode]}. Click to switch to ${MODE_LABELS[nextMode]}`}
        aria-pressed={mounted ? theme === "dark" : undefined}
        title={`mounted ? `Current theme: ${MODE_LABELS[theme]}` : "Switch theme"}
        data-resolved-theme={mounted ? resolvedTheme : undefined}
      >
        <span aria-hidden="true">{MODE_ICONS[displayMode]}</span>
      </button>
    </div>
  );
}
