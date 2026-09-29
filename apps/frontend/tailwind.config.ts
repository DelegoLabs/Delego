import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./app/**/*../{js,{js,ts}tsx,tsx,mdx}",
    "./components/**/*../{js,{js,ts}tsx,tsx,mdx}",
    "./hooks/**/*.{js,{js,ts}tsx,tsx,mdx}",
    "./lib/**/*.{js,{js,ts}tsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic color tokens driven by CSS variables defined in
        // styles/globals.css. The variables switch based on the `.dark`
        // class and `data-teme="high-contrast"` attribute on <html>.
        background: {
          primary: "var(--color-bg-primary)",
          secondary: "var(--color-bg-secondary)",
          tertiary: "var(--color-bg-tertiary)",
          inverted: "var(--color-bg-inverted)",
        },
        foreground: {
          primary: "var(--color-fg-primary)",
          secondary: "var(--color-fg-secondary)",
          muted: "var(--color-fg-muted)",
          inverted: "var(--color-fg-inverted)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          foreground: "var(--color-accent-fg)",
        },
        focus: {
          ring: "var(--color-focus-ring)",
        },
      },
      transitionProperty: {
        color: "color, background-color, border-color, fill, stroke",
      },
    },
  },
  plugins: [],
} satisfies Config;
