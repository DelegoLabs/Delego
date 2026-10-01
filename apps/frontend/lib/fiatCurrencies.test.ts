import { describe, it, expect } from "vitest";
import {
  DEFAULT_FIAT_CURRENCY,
  FIAT_CURRENCIES,
  FIAT_CURRENCY_CODES,
  getFiatCurrencyConfig,
  isFiatCurrency,
} from "./fiatCurrencies";

describe("fiatCurrencies", () => {
  it("exposes the four supported storefront currencies in order", () => {
    expect(FIAT_CURRENCY_CODES).toEqual(["USD", "EUR", "GBP", "NGN"]);
  });

  it("provides a label and symbol for every currency", () => {
    for (const code of FIAT_CURRENCY_CODES) {
      const config = FIAT_CURRENCIES[code];
      expect(config.code).toBe(code);
      expect(config.label.length).toBeGreaterThan(0);
      expect(config.symbol.length).toBeGreaterThan(0);
    }
    expect(FIAT_CURRENCIES.NGN.symbol).toBe("₦");
  });

  it("narrows valid currency codes only", () => {
    expect(isFiatCurrency("USD")).toBe(true);
    expect(isFiatCurrency("NGN")).toBe(true);
    expect(isFiatCurrency("XLM")).toBe(false);
    expect(isFiatCurrency("")).toBe(false);
  });

  it("returns the config for a currency and defaults to USD", () => {
    expect(getFiatCurrencyConfig("EUR")).toBe(FIAT_CURRENCIES.EUR);
    expect(DEFAULT_FIAT_CURRENCY).toBe("USD");
  });
});
