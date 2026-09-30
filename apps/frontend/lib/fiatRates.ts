import { FIAT_CURRENCY_CODES, type FiatCurrency } from "./fiatCurrencies";

/**
 * Fiat conversion rates for the storefront display switcher (#805).
 *
 * Rates are quoted as "units of fiat per 1 XLM" and fetched from a
 * backend endpoint (`NEXT_PUBLIC_FIAT_RATES_URL`) so a real price feed can
 * be swapped in without a code change. When the endpoint is unset or
 * unreachable we fall back to the last cached snapshot, then to a static
 * placeholder, so the switcher keeps working (with a staleness indicator)
 * rather than erroring.
 */

const RATE_CACHE_KEY = "delego_fiat_rates_cache";
const RATE_STALE_AFTER_MS = 5 * 60 * 1000;
const STROOPS_PER_XLM = 10_000_000n;

/** Placeholder rates used only when no live source is configured/reachable. Not live market data. */
const FALLBACK_RATES: Record<FiatCurrency, number> = {
  USD: 0.12,
  EUR: 0.11,
  GBP: 0.095,
  NGN: 190,
};

export interface FiatRates {
  base: "XLM";
  rates: Record<FiatCurrency, number>;
  /** Epoch millis the rates were fetched (or when the fallback was applied). */
  fetchedAt: number;
  /** True when this is the static fallback, not a live-fetched snapshot. */
  isFallback: boolean;
}

function readCache(): FiatRates | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RATE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FiatRates;
    return coerceRates(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(snapshot: FiatRates): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore persistence failures — the in-memory value still updates.
  }
}

function fallbackSnapshot(): FiatRates {
  return {
    base: "XLM",
    rates: { ...FALLBACK_RATES },
    fetchedAt: Date.now(),
    isFallback: true,
  };
}

/** True once the snapshot is the fallback or older than the staleness window. */
export function isFiatRateStale(snapshot: FiatRates): boolean {
  return (
    snapshot.isFallback ||
    Date.now() - snapshot.fetchedAt > RATE_STALE_AFTER_MS
  );
}

/**
 * Normalizes an API payload into a complete rate map. Accepts either
 * `{ rates: {...} }` or a bare `{ USD, EUR, GBP, NGN }` object and fills any
 * missing/invalid currency from the static fallback. Returns null when no
 * usable rate is present at all.
 */
export function coerceRates(input: unknown): Record<FiatCurrency, number> | null {
  if (!input || typeof input !== "object") return null;
  const source =
    "rates" in input && input.rates && typeof input.rates === "object"
      ? (input as { rates: unknown }).rates
      : input;

  const result = { ...FALLBACK_RATES };
  let found = false;
  for (const code of FIAT_CURRENCY_CODES) {
    const value = (source as Record<string, unknown>)[code];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      result[code] = value;
      found = true;
    }
  }
  return found ? result : null;
}

/**
 * Fetches the current XLM→fiat rates from `NEXT_PUBLIC_FIAT_RATES_URL`.
 * Falls back to the last cached snapshot, then to the static placeholder, if
 * the endpoint is unset or the request fails — callers should pair this with
 * `isFiatRateStale` to warn the user.
 */
export async function fetchFiatRates(
  signal?: AbortSignal
): Promise<FiatRates> {
  const url = process.env.NEXT_PUBLIC_FIAT_RATES_URL;
  if (!url) {
    return readCache() ?? fallbackSnapshot();
  }

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Fiat rates endpoint returned ${res.status}`);
    const body: unknown = await res.json();
    const rates = coerceRates(body);
    if (!rates) throw new Error("Fiat rates endpoint returned invalid rates");

    const snapshot: FiatRates = {
      base: "XLM",
      rates,
      fetchedAt: Date.now(),
      isFallback: false,
    };
    writeCache(snapshot);
    return snapshot;
  } catch {
    return readCache() ?? fallbackSnapshot();
  }
}

/** Converts a stroops amount into the selected fiat currency using `rates`. */
export function convertStroopsToFiat(
  tokenAmountStroops: bigint,
  currency: FiatCurrency,
  rates: FiatRates
): number {
  const xlm = Number(tokenAmountStroops) / Number(STROOPS_PER_XLM);
  return xlm * rates.rates[currency];
}

/** Formats a converted amount with the proper currency symbol for the locale. */
export function formatFiatAmount(
  value: number,
  currency: FiatCurrency,
  locale?: string
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(value);
}
