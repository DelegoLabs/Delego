/**
 * JS mirror of the chip tone bg/fg pairs defined in globals.css, kept only so the contrast
 * regression test can verify them without a browser. Dark mode reverses each pair exactly
 * (see globals.css's `@media (prefers-color-scheme: dark)` block), so one ratio per tone
 * covers both themes.
 */
export const CHIP_TONE_PAIRS = {
  neutral: { bg: "#f3f4f6", fg: "#374151" },
  info: { bg: "#dbeafe", fg: "#1e3a8a" },
  warning: { bg: "#fef3c7", fg: "#78350f" },
  danger: { bg: "#fee2e2", fg: "#7f1d1d" },
  success: { bg: "#dcfce7", fg: "#14532d" },
} as const;
