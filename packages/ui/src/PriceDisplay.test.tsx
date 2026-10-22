import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceDisplay } from "./PriceDisplay";

describe("PriceDisplay", () => {
  it("renders crypto primary by default", () => {
    render(<PriceDisplay stroops={10_000_000n} currency="XLM" targetFiat="USD" />);

    const primary = screen.getByTestId("price-primary");
    const secondary = screen.getByTestId("price-secondary");

    expect(primary).toHaveTextContent("1.00 XLM");
    expect(secondary).toHaveTextContent("$0.12");
  });

  it("swaps primary and secondary values when mode is fiat_primary", () => {
    render(
      <PriceDisplay
        stroops={10_000_000n}
        currency="XLM"
        mode="fiat_primary"
        targetFiat="USD"
      />
    );

    const primary = screen.getByTestId("price-primary");
    const secondary = screen.getByTestId("price-secondary");

    expect(primary).toHaveTextContent("$0.12");
    expect(secondary).toHaveTextContent("1.00 XLM");
  });

  it("formats target fiat for EUR, GBP, and NGN correctly", () => {
    const { rerender } = render(
      <PriceDisplay
        stroops={10_000_000n}
        currency="XLM"
        mode="fiat_primary"
        targetFiat="EUR"
      />
    );
    expect(screen.getByTestId("price-primary").textContent).toMatch(/€\s*0\.11|0\.11\s*€/);

    rerender(
      <PriceDisplay
        stroops={10_000_000n}
        currency="XLM"
        mode="fiat_primary"
        targetFiat="GBP"
      />
    );
    expect(screen.getByTestId("price-primary").textContent).toMatch(/£\s*0\.10|£\s*0\.095/);

    rerender(
      <PriceDisplay
        stroops={10_000_000n}
        currency="XLM"
        mode="fiat_primary"
        targetFiat="NGN"
      />
    );
    expect(screen.getByTestId("price-primary").textContent).toMatch(/₦|NGN/);
  });

  it("handles string and number stroops representations safely", () => {
    const { rerender } = render(
      <PriceDisplay stroops="20000000" currency="USDC" mode="crypto_primary" />
    );
    expect(screen.getByTestId("price-primary")).toHaveTextContent("2.00 USDC");

    rerender(
      <PriceDisplay stroops={50_000_000} currency="XLM" mode="crypto_primary" />
    );
    expect(screen.getByTestId("price-primary")).toHaveTextContent("5.00 XLM");
  });

  it("hides secondary display when showSecondary is false", () => {
    render(
      <PriceDisplay
        stroops={10_000_000n}
        currency="XLM"
        showSecondary={false}
      />
    );

    expect(screen.getByTestId("price-primary")).toBeInTheDocument();
    expect(screen.queryByTestId("price-secondary")).toBeNull();
  });

  it("uses custom fiatRate when provided", () => {
    render(
      <PriceDisplay
        stroops={10_000_000n}
        currency="XLM"
        targetFiat="USD"
        fiatRate={0.5}
        mode="fiat_primary"
      />
    );

    expect(screen.getByTestId("price-primary")).toHaveTextContent("$0.50");
  });
});
