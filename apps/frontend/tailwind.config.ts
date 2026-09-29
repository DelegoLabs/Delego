import type { Config } from "tailwindcss";

function withOpacity(variable: string) {
  return `"rgb(var(${variable}) / <alpha-value>)"`;
}

function solid(variable: string) {
  return `var(${variable})`;
}

const themeColors = {
  background: withOpacity("--color-bg"),
  foreground: withOpacity("--color-fg"),
  card: {
    DEFAULT: withOpacity("--color-card"),
    foreground: withOpacity("--color-card-fg"),
  },
  popover: {
    DEFAULT: withOpacity("--color-popover"),
    foreground: withOpacity("--color-popover-fg"),
  },
  muted: {
    DEFAULT: withOpacity("--color-muted"),
    foreground: withOpacity("--color-muted-fg"),
  },
  accent: {
    DEFAULT: withOpacity("--color-accent"),
    foreground: withOpacity("--color-accent-fg"),
  },
  border: withOpacity("--color-border"),
  input: withOpacity("--color-input"),
  ring: withOpacity("--color-ring"),
  primary: {
    DEFAULT: withOpacity("--color-primary"),
    foreground: withOpacity("--color-primary-fg"),
  },
  secondary: {
    DEFAULT: withOpacity("--color-secondary"),
    foreground: withOpacity("--color-secondary-fg"),
  },
  danger: withOpacity("--color-danger"),
  success: withOpacity("--color-success"),
  warning: withOpacity("--color-warning"),
} as const;

const config = {
  darkMode: ["class", ["data-theme='dark'", "data-theme='high-contrast'"]],
  content: [
    "./app/**/*.{tsx,ts,jsx,js}",
    "./components/**/*.{tsx,ts,jsx,js}",
    "./hooks/**/*.{tsx,ts,jsx,js}",
  ],
  theme: {
    extend: {
      colors: themeColors,
      transitionDuration: {
        theme: "150ms",
      },
      borderColor: {
        DEFAULT: solid("--color-border"),
      },
      ringColor: {
        DEFAULT: solid("--color-ring"),
      },
      outlineColor: {
        DEFAULT: solid("--color-ring"),
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
