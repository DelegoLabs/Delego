import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandRegistryProvider } from "./useCommandRegistry";
import { useBuiltinCommands } from "./useBuiltinCommands";
import { NetworkProvider } from "./useNetwork";
import {
  ThemeContext,
  type ThemeContextValue,
} from "../components/providers/ThemeProvider";
import { CommandPalette } from "../components/command-palette/CommandPalette";
import { LOCALE_COOKIE } from "../i18n/config";

const pushMock = vi.fn();
const routerMock = { push: pushMock };
const tMock = (key: string) => key;

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => tMock,
  useLocale: () => "en",
}));

function BuiltinCommandsPalette({ onClose }: { onClose: () => void }) {
  useBuiltinCommands();
  return <CommandPalette onClose={onClose} />;
}

function renderWithProviders(
  themeValue: ThemeContextValue,
  onClose = vi.fn()
) {
  return render(
    <ThemeContext.Provider value={themeValue}>
      <NetworkProvider>
        <CommandRegistryProvider>
          <BuiltinCommandsPalette onClose={onClose} />
        </CommandRegistryProvider>
      </NetworkProvider>
    </ThemeContext.Provider>
  );
}

describe("useBuiltinCommands quick actions", () => {
  const originalLocation = window.location;
  let reloadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`;
    pushMock.mockClear();
    reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("registers Light, Dark, and High-Contrast theme quick actions", async () => {
    const user = userEvent.setup();
    const setTheme = vi.fn();
    renderWithProviders({
      theme: "light",
      resolvedTheme: "light",
      setTheme,
    });

    expect(screen.getByText("Switch to Light theme")).toBeInTheDocument();
    expect(screen.getByText("Switch to Dark theme")).toBeInTheDocument();
    expect(
      screen.getByText("Switch to High-Contrast theme")
    ).toBeInTheDocument();

    await user.click(screen.getByText("Switch to High-Contrast theme"));
    expect(setTheme).toHaveBeenCalledWith("high-contrast");
  });

  it("switches to Dark theme when selected from the palette", async () => {
    const user = userEvent.setup();
    const setTheme = vi.fn();
    renderWithProviders({
      theme: "light",
      resolvedTheme: "light",
      setTheme,
    });

    await user.click(screen.getByText("Switch to Dark theme"));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("registers EN and DE locale quick actions and sets the locale cookie", async () => {
    const user = userEvent.setup();
    const setTheme = vi.fn();
    renderWithProviders({
      theme: "light",
      resolvedTheme: "light",
      setTheme,
    });

    expect(
      screen.getByText("Switch language to English (EN)")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Switch language to Deutsch (DE)")
    ).toBeInTheDocument();

    await user.click(screen.getByText("Switch language to Deutsch (DE)"));
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=de`);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("registers Stellar network quick action and toggles Testnet/Mainnet", async () => {
    const user = userEvent.setup();
    const setTheme = vi.fn();
    renderWithProviders({
      theme: "light",
      resolvedTheme: "light",
      setTheme,
    });

    // Default network is testnet, so quick action offers Mainnet.
    const switchToMainnet = screen.getByText("Switch to Mainnet");
    expect(switchToMainnet).toBeInTheDocument();

    await user.click(switchToMainnet);
    expect(window.localStorage.getItem("delego_active_network")).toBe(
      "mainnet"
    );
  });
});
