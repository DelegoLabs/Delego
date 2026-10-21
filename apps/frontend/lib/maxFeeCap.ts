/**
 * The user's max-fee comfort limit (#1002).
 *
 * This is a plain UI preference — the ceiling the user is comfortable
 * paying for a single transaction's network fee. It is deliberately *not*
 * part of the "Clear local data" sweep (`lib/localDataClear.ts`): wiping a
 * user's fee ceiling on "delete my data" would silently reset their app
 * configuration, which is exactly what that flow is meant to avoid.
 *
 * Stored in localStorage as a decimal string of stroops so it survives
 * JSON round-trips and never loses precision.
 */

/** localStorage key holding the user's max-fee comfort limit. */
export const MAX_FEE_CAP_STORAGE_KEY = "delego_max_fee_cap_stroops";

/**
 * Default ceiling: 100,000 stroops (0.01 XLM). A quiet network charges a
 * few hundred stroops for a transfer, so this only trips once fees have
 * genuinely spiked.
 */
export const DEFAULT_MAX_FEE_CAP_STROOPS = "100000";

/** Smallest ceiling a user may set — one stroop. */
export const MIN_MAX_FEE_CAP_STROOPS = 1n;

function hasLocalStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

/**
 * Whether a value is a usable max-fee ceiling: a positive integer number of
 * stroops, in decimal string form.
 */
export function isValidMaxFeeCapStroops(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  try {
    return BigInt(trimmed) >= MIN_MAX_FEE_CAP_STROOPS;
  } catch {
    return false;
  }
}

/**
 * Reads the user's configured ceiling. Falls back to the default when
 * nothing is stored, when the stored value is malformed, or when storage is
 * unavailable (private browsing).
 */
export function readMaxFeeCapStroops(): string {
  if (!hasLocalStorage()) return DEFAULT_MAX_FEE_CAP_STROOPS;
  try {
    const stored = window.localStorage.getItem(MAX_FEE_CAP_STORAGE_KEY);
    if (stored && isValidMaxFeeCapStroops(stored)) {
      return BigInt(stored.trim()).toString();
    }
  } catch {
    // Storage unavailable — fall through to the default.
  }
  return DEFAULT_MAX_FEE_CAP_STROOPS;
}

/**
 * Persists the user's ceiling. Rejects invalid values (leaving the stored
 * preference untouched) and returns whether the write happened.
 */
export function writeMaxFeeCapStroops(value: string): boolean {
  if (!isValidMaxFeeCapStroops(value)) return false;
  if (!hasLocalStorage()) return false;
  try {
    window.localStorage.setItem(
      MAX_FEE_CAP_STORAGE_KEY,
      BigInt(value.trim()).toString()
    );
    return true;
  } catch {
    return false;
  }
}

/** Resets the ceiling back to the default. */
export function clearMaxFeeCapStroops(): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(MAX_FEE_CAP_STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
