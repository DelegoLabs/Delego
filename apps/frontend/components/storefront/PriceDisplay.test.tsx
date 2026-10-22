import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceDisplay } from "./PriceDisplay";
import { CurrencyProvider } from "../../hooks/useCurrency";

describe("PriceDisplay in frontend", () => {
  it("renders with fallback defaults when used outside CurrencyProvider", () => {
    render(<PriceDisplay stroops={20_000_000n} currency="USDC" />);

    expect(screen.getByTestId("price-primary")).toHaveTextContent("2.00 USDC");
    expect(screen.getByTestId("price-secondary")).toHaveTextContent("$0.24");
  });

  it("honors mode and targetFiat passed via props directly", () => {
    render(
      <PriceDisplay
        stroops={10_000_000n}
        currency="XLM"
        mode="fiat_primary"
        targetFiat="NGN"
      />
    );

    expect(screen.getByTestId("price-primary").textContent).toMatch(/₦|NGN/);
    expect(screen.getByTestId("price-secondary")).toHaveTextContent("1.00 XLM");
  });

  it("swaps primary and secondary values when rendered inside CurrencyProvider with fiat_primary", () => {
    window.localStorage.setItem(
      "delego_currency_preference",
      JSON.stringify({ mode: "fiat_primary", targetFiat: "USD" })
    );

    render(
      <CurrencyProvider>
        <PriceDisplay stroops={10_000_000n} currency="XLM" />
      </CurrencyProvider>
    );

    expect(screen.getByTestId("price-primary")).toHaveTextContent("$0.12");
    expect(screen.getByTestId("price-secondary")).toHaveTextContent("1.00 XLM");
  });
});
