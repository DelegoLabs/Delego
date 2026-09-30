"use client";

import { useEffect, useState } from "react";
import {
  fetchFiatRates,
  isFiatRateStale,
  type FiatRates,
} from "../lib/fiatRates";

export interface UseFiatRatesResult {
  /** Latest rate snapshot, or null before the first fetch resolves. */
  rates: FiatRates | null;
  loading: boolean;
  /** True when the loaded snapshot is a fallback or older than the staleness window. */
  stale: boolean;
}

/**
 * Loads XLM→fiat conversion rates on mount for the storefront currency
 * switcher (#805). Mirrors hooks/useCurrency.tsx's rate handling: the fetch
 * is aborted on unmount and failures degrade to cached/placeholder rates.
 */
export function useFiatRates(): UseFiatRatesResult {
  const [rates, setRates] = useState<FiatRates | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchFiatRates(controller.signal).then(setRates);
    return () => controller.abort();
  }, []);

  return {
    rates,
    loading: rates === null,
    stale: rates ? isFiatRateStale(rates) : false,
  };
}
