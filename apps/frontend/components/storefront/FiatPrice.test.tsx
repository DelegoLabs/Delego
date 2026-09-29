import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FiatPrice } from "./FiatPrice";
import type { FiatRates } from "../../lib/fiatRates";

const useFiatRatesMock = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useFiatRates", () => ({
  useFiatRates: useFiatRatesMock,
}));

const RATES: FiatRates = {
  base: "XLM",
  rates: { USD: 0.5, EUR: 0.4, GBP: 0.3, NGN: 100 },
  fetchedAt: Date.now(),
  isFallback: false,
};

describe("FiatPrice", () => {
  beforeEach(() => {
    useFiatRatesMock.mockReturnValue({ rates: RATES, loading: false, stale: false });
  });

  it("renders the converted fiat amount with the currency symbol", () => {
    render(<FiatPrice tokenAmountStroops={10_000_000n} selectedFiat="USD" />);
    expect(screen.getByText("$0.50")).toBeInTheDocument();
  });

  it("converts to the selected currency", () => {
    render(<FiatPrice tokenAmountStroops={10_000_000n} selectedFiat="NGN" />);
    expect(screen.getByText(/100\.00/)).toBeInTheDocument();
  });

  it("shows a loading state until rates resolve", () => {
    useFiatRatesMock.mockReturnValue({ rates: null, loading: true, stale: false });
    render(<FiatPrice tokenAmountStroops={10_000_000n} selectedFiat="EUR" />);
    expect(screen.getByRole("status")).toHaveTextContent(/converting/i);
  });

  it("flags stale/fallback rates with a tooltip", () => {
    useFiatRatesMock.mockReturnValue({ rates: RATES, loading: false, stale: true });
    render(<FiatPrice tokenAmountStroops={10_000_000n} selectedFiat="GBP" />);
    expect(screen.getByText("£0.30")).toHaveAttribute("title");
  });
});
