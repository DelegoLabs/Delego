"use client";

import { useFiatRates } from "../../hooks/useFiatRates";
import { convertStroopsToFiat, formatFiatAmount } from "../../lib/fiatRates";
import type { FiatCurrency } from "../../lib/fiatCurrencies";

export interface FiatConversionProps {
  /** Item price in stroops (1 XLM = 10,000,000 stroops). */
  tokenAmountStroops: bigint;
  /** Fiat currency to display the estimated price in. */
  selectedFiat: FiatCurrency;
  /** Optional BCP-47 locale; defaults to the browser locale. */
  locale?: string;
}

/**
 * Shows an estimated item price in the buyer's preferred fiat currency
 * (#805). Rates are loaded from the backend via useFiatRates; while they
 * load (or when they can only be approximated) the component degrades
 * gracefully rather than blocking the storefront.
 */
export function FiatPrice({
  tokenAmountStroops,
  selectedFiat,
  locale,
}: FiatConversionProps) {
  const { rates, stale } = useFiatRates();

  if (!rates) {
    return (
      <span
        className="fiat-price fiat-price-loading"
        role="status"
        aria-live="polite"
      >
        Converting…
      </span>
    );
  }

  const value = convertStroopsToFiat(tokenAmountStroops, selectedFiat, rates);

  return (
    <span
      className="fiat-price"
      title={stale ? "Estimated from a cached exchange rate" : undefined}
    >
      {formatFiatAmount(value, selectedFiat, locale)}
    </span>
  );
}
