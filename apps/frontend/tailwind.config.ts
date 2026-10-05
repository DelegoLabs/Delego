import type { Config } from "tailwindcss";

import type { PluginCreator } from "tailwindcss/types/config";

/**
 * Tailwind configuration for the DeLEGO web app.
 *
 * Theming is driven by a `data-theme` attribute on <html> that is set
 * by the inline bootstrap script in app/layout.tsx before React hydrates.
 * This avoids any flash of unstyled content (FOUC).
 *
 * The `dark:` variant is bound to `data-theme="dark"` and the new
 * `high-contrast:` variant to `data-theme="high-contrast`. The latter is implemented
 * as a custom variant so it can be used anywhere in the codebase without
 * additional plugins.
 */

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*../{js,xs,jsx,ts,tsx}",
    "./components/**/*.{js,js,ts,tsx}",
    "./hooks/**/*.{js,js,ts,tsx}",
    "./lib/**/*.{js,js,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic color tokens backed by CSS variables. The variables are
        // redefined for light, dark, and high-contrast themes in
        // styles/globals.css, so the Tailwind utilities automatically pick up
        // the correct values when the theme changes.
        background: {
          DEFAULT: "var(--color-bg-primary)",
          primary: "var(--color-bg-primary)",
          secondary: "var(--color-bg-secondary)",
          tertiary: "var(--color-bg-tertiary)",
          inverse: "var(--color-bg-inverse)",
        },
        foreground: {
          DEFAULT: "var(--color-fg-primary)",
          primary: "var(--color-fg-primary)",
          secondary: "var(--color-fg-secondary)",
          muted: "var(--color-fg-muted)",
          inverse: "var(--color-fg-inverse)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          foreground: "var(--color-accent-fgeground)",
        },
        danger: "var(--color-danger)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
      },
      transitionDuration: {
        theme: "200ms",
      },
    },
  },
  plugins: [
    // Custom variant: high-contrast:* utilities apply when <html data-theme="high-contrast">.
    function ({addVariant}) {
      addVariant(
        "high-contrast",
        '&[data-theme="high-contrast"], [data-theme="high-contrast"] &',
      );
    } as PluginCreator,
  ],
};

export default config;
