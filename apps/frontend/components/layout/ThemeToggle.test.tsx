import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

function mockSystemTheme(prefersDark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && prefersDark,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    mockSystemTheme(false);
  });

  it("uses the system preference when no choice has been saved", () => {
    mockSystemTheme(true);

    render(<ThemeToggle />);

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(
      screen.getByRole("button", { name: /Theme: System/i })
    ).toHaveAttribute("title", "Current theme: System");
  });

  it("uses a saved preference instead of the system preference", () => {
    localStorage.setItem("delego-theme-mode", "light");
    mockSystemTheme(true);

    render(<ThemeToggle />);

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(
      screen.getByRole("button", { name: /Theme: Light/i })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles the theme and persists the selection", async () => {
    localStorage.setItem("delego-theme-mode", "light");
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(
      screen.getByRole("button", { name: /Theme: Light/i })
    );

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("delego-theme-mode")).toBe("dark");
    expect(
      screen.getByRole("button", { name: /Theme: Dark/i })
    ).toHaveAttribute("aria-pressed", "true");
  });
});
