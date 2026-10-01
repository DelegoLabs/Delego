"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "high-contrast" | "system";
export type ResolvedTheme = "light" | "dark" | "high-contrast";

export interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme(theme: ThemeMode): void;
}

export const THEME_STORAGE_KEY = "delego:theme";

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: unknown): value is ThemeMode {
  return (
    value === "light" ||
    value === "dark" ||
    value === "high-contrast" ||
    value === "system"
  );
}

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function getSystemTheme(): Exclude<ResolvedTheme, "high-contrast"> {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") {
    return getSystemTheme();
  }
  return mode;
}

function applyTheme(theme: ResolvedTheme) {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme === "light" ? "light" : "dark";
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Optional initial theme for SSR/tests. */
  defaultTheme?: ThemeMode;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
}: ThemeProviderProps) {
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === "undefined") {
      return "light";
    }
    return getSystemTheme();
  });

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return defaultTheme;
    }
    return readStoredTheme();
  });

  // Listen for system preference changes so "system" mode stays in sync.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      setSystemTheme(media.matches ? "dark" : "light");
    };
    handler();
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const resolvedTheme = useMemo<ResolvedTheme>(
    () => (theme === "system" ? systemTheme : theme),
    [theme, systemTheme],
  );

  // Apply the resolved theme to <html> as a data attribute. This is the
  // class-based switch that Tailwind reads via darkMode: ["class", '[data-theme="dark"]'].
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        /* localStorage may be unavailable (private mode, embedded webview). */
      }
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export default ThemeProvider;
