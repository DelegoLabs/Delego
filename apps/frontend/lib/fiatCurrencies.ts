/**
 * Fiat display currencies for the global multi-currency storefront (#805).
 *
 * Item prices are always stored on-chain in stroops (1 XLM = 10,000,000
 * stroops); this module only describes the fiat currencies a buyer may
 * convert those prices into for display. Conversion itself lives in
 * lib/fiatRates.ts.
 */

export type FiatCurrency = "USD" | "EUR" | "GBP" | "NGN";

export interface FiatCurrencyConfig {
  /** ISO 4217 code, also used as the persisted value. */
  code: FiatCurrency;
  /** Human-readable name shown in the switcher. */
  label: string;
  /** Short symbol used inline next to converted amounts. */
  symbol: string;
}

export const FIAT_CURRENCIES: Record<FiatCurrency, FiatCurrencyConfig> = {
  USD: { code: "USD", label: "US Dollar", symbol: "$" },
  EUR: { code: "EUR", label: "Euro", symbol: "€" },
  GBP: { code: "GBP", label: "British Pound", symbol: "£" },
  NGN: { code: "NGN", label: "Nigerian Naira", symbol: "₦" },
};

export const FIAT_CURRENCY_CODES = Object.keys(
  FIAT_CURRENCIES
) as FiatCurrency[];

export const DEFAULT_FIAT_CURRENCY: FiatCurrency = "USD";

/** Narrow an arbitrary string (e.g. a stored preference) to a supported currency. */
export function isFiatCurrency(value: string): value is FiatCurrency {
  return value in FIAT_CURRENCIES;
}

export function getFiatCurrencyConfig(code: FiatCurrency): FiatCurrencyConfig {
  return FIAT_CURRENCIES[code];
}
