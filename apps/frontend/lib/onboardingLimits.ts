/**
 * Spending limits chosen during onboarding (#1210).
 *
 * Onboarding is a public route, so there is no signed-in profile to attach
 * these to yet. The choices are kept as decimal stroop strings in localStorage
 * (never as Numbers, which would lose precision) and are read back on the next
 * visit. Like the other plain UI preferences, this key is intentionally not
 * part of the "Clear local data" sweep in lib/localDataClear.ts.
 */

export const ONBOARDING_LIMITS_STORAGE_KEY = "delego_onboarding_limits";

export interface OnboardingSpendingLimits {
  /** Ceiling for a single agent purchase, in stroops. */
  maxPerTransactionStroops: string;
  /** Ceiling for the total spent across a 24-hour window, in stroops. */
  dailyLimitStroops: string;
}

/** Sensible starter limits: 100 XLM per purchase, 500 XLM per day. */
export const DEFAULT_ONBOARDING_LIMITS: OnboardingSpendingLimits = {
  maxPerTransactionStroops: "1000000000",
  dailyLimitStroops: "5000000000",
};

function hasLocalStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function isValidStroopAmount(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  try {
    return BigInt(trimmed) > 0n;
  } catch {
    return false;
  }
}

/** Both limits must be positive, and the daily window cannot be tighter than a single purchase. */
export function isValidOnboardingLimits(limits: OnboardingSpendingLimits): boolean {
  return (
    isValidStroopAmount(limits.maxPerTransactionStroops) &&
    isValidStroopAmount(limits.dailyLimitStroops) &&
    BigInt(limits.dailyLimitStroops.trim()) >=
      BigInt(limits.maxPerTransactionStroops.trim())
  );
}

/**
 * Reads the saved limits, falling back to the defaults when storage is
 * unavailable, empty, or holds a malformed/stale shape.
 */
export function readOnboardingLimits(): OnboardingSpendingLimits {
  if (!hasLocalStorage()) return { ...DEFAULT_ONBOARDING_LIMITS };
  try {
    const stored = window.localStorage.getItem(ONBOARDING_LIMITS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<OnboardingSpendingLimits>;
      const candidate: OnboardingSpendingLimits = {
        maxPerTransactionStroops: String(parsed?.maxPerTransactionStroops ?? ""),
        dailyLimitStroops: String(parsed?.dailyLimitStroops ?? ""),
      };
      if (isValidOnboardingLimits(candidate)) return candidate;
    }
  } catch {
    // Storage unavailable or corrupt — fall through to the defaults.
  }
  return { ...DEFAULT_ONBOARDING_LIMITS };
}

/**
 * Persists the chosen limits. Invalid values are rejected without touching
 * any previously stored preference; returns whether the write happened.
 */
export function writeOnboardingLimits(
  limits: OnboardingSpendingLimits
): boolean {
  if (!isValidOnboardingLimits(limits) || !hasLocalStorage()) return false;
  try {
    window.localStorage.setItem(
      ONBOARDING_LIMITS_STORAGE_KEY,
      JSON.stringify({
        maxPerTransactionStroops: BigInt(
          limits.maxPerTransactionStroops.trim()
        ).toString(),
        dailyLimitStroops: BigInt(limits.dailyLimitStroops.trim()).toString(),
      })
    );
    return true;
  } catch {
    return false;
  }
}
