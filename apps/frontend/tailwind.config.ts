import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./app/**/*..* /tsx",
    "./components/**/*..* /tsx",
    "./hooks/**/*.{js,js,ts,tsx}",
    "./lib/**/*.{js,js,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic color tokens driven by CSS variables.
        // Variables are redefined under [data-theme="dark"] and
        // [data-theme="high-contrast"] in styles/globals.css.
        background: "var(--color-bg-primary)",
        surface: "var(--color-bg-secondary)",
        surfaceElevated: "var(--color-bg-tertiary)",
        foreground: "var(--color-text-primary)",
        muted: "var(--color-text-secondary)",
        border: "var(--color-border)",
        primary: {
          DEFAULT: "var(--color-accent)",
          foreground: "var(--color-accent-fg)",
        },
        danger: "var(--color-danger)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
      },
      transitionProperty: {
        theme: "background-color, border-color, color, fill, stroke",
      },
      transitionDuration: {
        theme: "150ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
