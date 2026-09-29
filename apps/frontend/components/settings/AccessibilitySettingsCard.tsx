"use client";

import { Card, Button } from "@delegolabs/ui";
import {
  useAccessibility,
  type ReduceMotionMode,
} from "../../hooks/useAccessibility";
import { useTheme, type ThemeMode } from "../../hooks/useTheme";

/**
 * Settings page section for managing accessibility preferences (#607):
 * text scaling (90–150%), forced high-contrast theme, reduce motion override,
 * and link underline toggle.
 */
export function AccessibilitySettingsCard() {
  const {
    preferences,
    setTextScale,
    setHighContrast,
    setReduceMotion,
    setUnderlineLinks,
    resetToDefaults,
  } = useAccessibility();
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <Card
      title="Accessibility preferences"
      ariaLabel="Accessibility preferences"
    >
      <div className="settings-section">
        {/* Theme Mode Switcher */}
        <div
          className="settings-toggle-row"
          style={{
            flexDirection: "column",
            alignItems: "stretch",
            gap: "0.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span className="settings-toggle-label" id="theme-mode-label">
              Theme ({resolvedTheme})
            </span>
            <div
              role="radiogroup"
              aria-labelledby="theme-mode-label"
              style={{ display: "flex", gap: "0.375rem" }}
            >
              {(["light", "dark", "high-contrast", "system"] as ThemeMode[]).map(
                (mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={theme === mode}
                    onClick={() => setTheme(mode)}
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "0.25rem",
                      border: "1px solid var(--color-border)",
                      background:
                        theme === mode
                          ? "var(--color-accent-bg)"
                          : "var(--color-bg-surface)",
                      color:
                        theme === mode
                          ? "var(--color-accent)"
                          : "var(--color-text-primary)",
                      cursor: "pointer",
                      fontWeight: theme === mode ? 600 : 400,
                    }}
                  >
                    {mode === "high-contrast"
                      ? "High contrast"
                      : mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ),
              )}
            </div>
          </div>
          <p className="settings-toggle-hint">
            Choose Light, Dark, or High Contrast (WCAG AAA). System follows your
            OS preference and updates automatically.
          </p>
        </div>

        {/* Text Scale Slider */}
        <div
          className="settings-toggle-row"
          style={{
            flexDirection: "column",
            alignItems: "stretch",
            gap: "0.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span className="settings-toggle-label" id="text-scale-label">
              Text scale ({preferences.textScale}%)
            </span>
            <div style={{ display: "flex", gap: "0.375rem" }}>
              {[90, 100, 125, 150].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTextScale(preset)}
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.25rem 0.5rem",
                    borderRadius: "0.25rem",
                    border: "1px solid var(--color-border)",
                    background:
                      preferences.textScale === preset
                        ? "var(--color-accent-bg)"
                        : "var(--color-bg-surface)",
                    color:
                      preferences.textScale === preset
                        ? "var(--color-accent)"
                        : "var(--color-text-primary)",
                    cursor: "pointer",
                    fontWeight: preferences.textScale === preset ? 600 : 400,
                  }}
                >
                  {preset}%
                </button>
              ))}
            </div>
          </div>
          <p className="settings-toggle-hint">
            Scales root font size (90% to 150%) so text and controls adjust
            across all pages.
          </p>
          <input
            type="range"
            min="90"
            max="150"
            step="5"
            value={preferences.textScale}
            onChange={(e) => setTextScale(Number(e.target.value))}
            aria-labelledby="text-scale-label"
            style={{ width: "100%", marginTop: "0.25rem", cursor: "pointer" }}
          />
        </div>

        {/* Forced High Contrast Toggle */}
        <label className="settings-toggle-row">
          <span>
            <span className="settings-toggle-label">
              Forced high-contrast theme
            </span>
            <p className="settings-toggle-hint">
              Increases color contrast for borders, text, and focus indicators
              for enhanced visibility.
            </p>
          </span>
          <input
            type="checkbox"
            checked={preferences.highContrast || resolvedTheme === "high-contrast"}
            onChange={(e) => {
              setHighContrast(e.target.checked);
              if (e.target.checked) setTheme("high-contrast");
            }}
            style={{
              width: "1.125rem",
              height: "1.125rem",
              marginTop: "0.25rem",
            }}
          />
        </label>

        {/* Reduce Motion Override */}
        <div className="settings-toggle-row">
          <span>
            <span className="settings-toggle-label" id="reduce-motion-label">
              Reduce motion override
            </span>
            <p className="settings-toggle-hint">
              {preferences.reduceMotion === "system"
                ? "Following system settings (OS preferences)."
                : preferences.reduceMotion === "on"
                  ? "Animations and smooth transitions are disabled."
                  : "Animations and smooth transitions are enabled."}
            </p>
          </span>
          <select
            value={preferences.reduceMotion}
            onChange={(e) =>
              setReduceMotion(e.target.value as ReduceMotionMode)
            }
            aria-labelledby="reduce-motion-label"
            style={{
              padding: "0.375rem 0.625rem",
              borderRadius: "0.375rem",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-surface)",
              color: "var(--color-text-primary)",
              fontSize: "0.875rem",
            }}
          >
            <option value="system">System default</option>
            <option value="on">Always reduce motion</option>
            <option value="off">Allow motion</option>
          </select>
        </div>

        {/* Underline Links Toggle */}
        <label className="settings-toggle-row">
          <span>
            <span className="settings-toggle-label">
              Always underline links
            </span>
            <p className="settings-toggle-hint">
              Ensures text links have a visible underline regardless of hover
              state.
            </p>
          </span>
          <input
            type="checkbox"
            checked={preferences.underlineLinks}
            onChange={(e) => setUnderlineLinks(e.target.checked)}
            style={{
              width: "1.125rem",
              height: "1.125rem",
              marginTop: "0.25rem",
            }}
          />
        </label>

        <div
          style={{
            marginTop: "0.75rem",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <Button
            variant="ghost"
            onClick={() => {
              resetToDefaults();
              setTheme("system");
            }}
          >
            Reset accessibility defaults
          </Button>
        </div>
      </div>
    </Card>
  );
}
