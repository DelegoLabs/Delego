import type { DisplayCurrencyMode, CurrencyPreference } from "@delegolabs/types";

export type { DisplayCurrencyMode, CurrencyPreference };

export const CURRENCY_PREFERENCE_STORAGE_KEY = "delego_currency_preference";

export const FIAT_TARGETS = ["USD", "EUR", "GBP", "NGN"] as const;
export type FiatTarget = (typeof FIAT_TARGETS)[number];

export const DEFAULT_CURRENCY_PREFERENCE: CurrencyPreference = {
  mode: "crypto_primary",
  targetFiat: "USD",
};

export function isDisplayCurrencyMode(
  value: unknown
): value is DisplayCurrencyMode {
  return value === "crypto_primary" || value === "fiat_primary";
}

export function isFiatTarget(value: unknown): value is FiatTarget {
  return (
    typeof value === "string" &&
    (FIAT_TARGETS as readonly string[]).includes(value)
  );
}

export function parseStoredCurrencyPreference(
  raw: string | null
): CurrencyPreference {
  if (!raw) return DEFAULT_CURRENCY_PREFERENCE;
  try {
    const parsed = JSON.parse(raw);
    const mode = isDisplayCurrencyMode(parsed?.mode)
      ? parsed.mode
      : DEFAULT_CURRENCY_PREFERENCE.mode;
    const targetFiat = isFiatTarget(parsed?.targetFiat)
      ? parsed.targetFiat
      : DEFAULT_CURRENCY_PREFERENCE.targetFiat;
    return { mode, targetFiat };
  } catch {
    return DEFAULT_CURRENCY_PREFERENCE;
  }
}
