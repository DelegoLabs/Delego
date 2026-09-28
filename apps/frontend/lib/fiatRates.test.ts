import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coerceRates,
  convertStroopsToFiat,
  fetchFiatRates,
  formatFiatAmount,
  isFiatRateStale,
  type FiatRates,
} from "./fiatRates";

const LIVE_RATES: FiatRates = {
  base: "XLM",
  rates: { USD: 0.5, EUR: 0.4, GBP: 0.3, NGN: 100 },
  fetchedAt: Date.now(),
  isFallback: false,
};

describe("coerceRates", () => {
  it("accepts a { rates } envelope and a bare map", () => {
    expect(coerceRates({ rates: { USD: 0.2 } })).toEqual({
      USD: 0.2,
      EUR: 0.11,
      GBP: 0.095,
      NGN: 190,
    });
    expect(coerceRates({ USD: 0.3 })?.USD).toBe(0.3);
  });

  it("rejects payloads with no usable rate", () => {
    expect(coerceRates(null)).toBeNull();
    expect(coerceRates({ rates: { USD: -1 } })).toBeNull();
    expect(coerceRates("nope")).toBeNull();
  });
});

describe("fetchFiatRates", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("falls back to placeholder rates when no endpoint is configured", async () => {
    const rates = await fetchFiatRates();
    expect(rates.isFallback).toBe(true);
    expect(rates.rates.USD).toBeGreaterThan(0);
    expect(isFiatRateStale(rates)).toBe(true);
  });

  it("fetches live rates from the configured backend endpoint", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIAT_RATES_URL", "https://rates.example.com/xlm");
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ rates: { USD: 0.2, EUR: 0.18 } }), {
          status: 200,
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const rates = await fetchFiatRates();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://rates.example.com/xlm",
      expect.objectContaining({ signal: undefined })
    );
    expect(rates.isFallback).toBe(false);
    expect(rates.rates.USD).toBeCloseTo(0.2);
    expect(isFiatRateStale(rates)).toBe(false);
  });

  it("falls back when the endpoint errors", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIAT_RATES_URL", "https://rates.example.com/xlm");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const rates = await fetchFiatRates();
    expect(rates.isFallback).toBe(true);
  });
});

describe("convertStroopsToFiat", () => {
  it("converts stroops to the selected currency", () => {
    expect(convertStroopsToFiat(10_000_000n, "USD", LIVE_RATES)).toBeCloseTo(0.5);
    expect(convertStroopsToFiat(10_000_000n, "NGN", LIVE_RATES)).toBeCloseTo(100);
    expect(convertStroopsToFiat(0n, "EUR", LIVE_RATES)).toBe(0);
  });
});

describe("formatFiatAmount", () => {
  it("formats with the proper currency symbol", () => {
    expect(formatFiatAmount(12.5, "USD", "en-US")).toContain("$");
    expect(formatFiatAmount(12.5, "GBP", "en-GB")).toContain("£");
  });
});
