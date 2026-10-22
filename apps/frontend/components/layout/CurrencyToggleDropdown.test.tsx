import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { CurrencyToggleDropdown } from "./CurrencyToggleDropdown";
import { CurrencyProvider } from "../../hooks/useCurrency";
import { PriceDisplay } from "../storefront/PriceDisplay";
import { CURRENCY_PREFERENCE_STORAGE_KEY } from "../../lib/currencyPreference";

describe("CurrencyToggleDropdown & Currency Switching", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the currency toggle component with default crypto primary", () => {
    render(
      <CurrencyProvider>
        <CurrencyToggleDropdown />
      </CurrencyProvider>
    );

    expect(screen.getByTestId("currency-toggle-dropdown")).toBeInTheDocument();
    expect(screen.getByTestId("currency-mode-toggle")).toHaveTextContent("XLM/USDC");
    expect(screen.getByTestId("currency-toggle-trigger")).toHaveTextContent("USD");
  });

  it("toggles currency mode when mode toggle button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <CurrencyProvider>
        <CurrencyToggleDropdown />
      </CurrencyProvider>
    );

    const toggleBtn = screen.getByTestId("currency-mode-toggle");
    await user.click(toggleBtn);

    expect(screen.getByTestId("currency-mode-toggle")).toHaveTextContent("$");

    await user.click(toggleBtn);
    expect(screen.getByTestId("currency-mode-toggle")).toHaveTextContent("XLM/USDC");
  });

  it("persists currency preference to localStorage", async () => {
    const user = userEvent.setup();
    render(
      <CurrencyProvider>
        <CurrencyToggleDropdown />
      </CurrencyProvider>
    );

    const toggleBtn = screen.getByTestId("currency-mode-toggle");
    await user.click(toggleBtn);

    const stored = window.localStorage.getItem(CURRENCY_PREFERENCE_STORAGE_KEY);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.mode).toBe("fiat_primary");
    expect(parsed.targetFiat).toBe("USD");
  });

  it("restores saved preference from localStorage on mount (survives restart)", () => {
    window.localStorage.setItem(
      CURRENCY_PREFERENCE_STORAGE_KEY,
      JSON.stringify({ mode: "fiat_primary", targetFiat: "EUR" })
    );

    render(
      <CurrencyProvider>
        <CurrencyToggleDropdown />
      </CurrencyProvider>
    );

    expect(screen.getByTestId("currency-toggle-trigger")).toHaveTextContent("EUR");
    expect(screen.getByTestId("currency-mode-toggle")).toHaveTextContent("€");
  });

  it("opens menu and allows selecting a different target fiat currency", async () => {
    const user = userEvent.setup();
    render(
      <CurrencyProvider>
        <CurrencyToggleDropdown />
      </CurrencyProvider>
    );

    const trigger = screen.getByTestId("currency-toggle-trigger");
    await user.click(trigger);

    expect(screen.getByRole("menu", { name: "Currency display options" })).toBeInTheDocument();

    const gbpOption = screen.getByTestId("select-fiat-GBP");
    await user.click(gbpOption);

    expect(screen.getByTestId("currency-toggle-trigger")).toHaveTextContent("GBP");
    const stored = JSON.parse(
      window.localStorage.getItem(CURRENCY_PREFERENCE_STORAGE_KEY)!
    );
    expect(stored.targetFiat).toBe("GBP");
  });

  it("allows selecting mode from the menu radios", async () => {
    const user = userEvent.setup();
    render(
      <CurrencyProvider>
        <CurrencyToggleDropdown />
      </CurrencyProvider>
    );

    const trigger = screen.getByTestId("currency-toggle-trigger");
    await user.click(trigger);

    const fiatRadio = screen.getByTestId("select-mode-fiat");
    await user.click(fiatRadio);

    expect(screen.getByTestId("currency-mode-toggle")).toHaveTextContent("$");

    const cryptoRadio = screen.getByTestId("select-mode-crypto");
    await user.click(cryptoRadio);

    expect(screen.getByTestId("currency-mode-toggle")).toHaveTextContent("XLM/USDC");
  });

  it("immediately updates PriceDisplay across the app when preference changes", async () => {
    const user = userEvent.setup();
    render(
      <CurrencyProvider>
        <CurrencyToggleDropdown />
        <PriceDisplay stroops={10_000_000n} currency="XLM" />
      </CurrencyProvider>
    );

    const primary = screen.getByTestId("price-primary");
    const secondary = screen.getByTestId("price-secondary");

    expect(primary).toHaveTextContent("1.00 XLM");
    expect(secondary).toHaveTextContent("$0.12");

    const toggleBtn = screen.getByTestId("currency-mode-toggle");
    await user.click(toggleBtn);

    expect(screen.getByTestId("price-primary")).toHaveTextContent("$0.12");
    expect(screen.getByTestId("price-secondary")).toHaveTextContent("1.00 XLM");

    await user.click(screen.getByTestId("currency-toggle-trigger"));
    await user.click(screen.getByTestId("select-fiat-EUR"));

    expect(screen.getByTestId("price-primary").textContent).toMatch(/€/);
    expect(screen.getByTestId("price-secondary")).toHaveTextContent("1.00 XLM");
  });
});
