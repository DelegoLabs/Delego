/**
 * Yield projection calculator for escrow deposits (#810).
 *
 * Projects potential interest earned while funds are held in Blend escrow.
 * Uses compound interest (daily compounding at the estimated APY) so the
 * projection is more accurate than simple interest over long windows.
 *
 * The `YieldProjectionCalculation` shape is the public contract: callers
 * (UI components, tests) consume this interface, not the internals.
 */

export interface YieldProjectionCalculation {
  principalAmount: number;
  estimatedHoldingDays: number;
  aprPercent: number;
  projectedEarningsUsd: number;
}

/** Blend estimated APY used for projections (percent). */
export const BLEND_PROJECTION_APR_PERCENT = 4.5;

/** Days in a year used for daily compounding. */
const DAYS_PER_YEAR = 365;

/** Hard cap on projected holding days (10 years). */
export const MAX_HOLDING_DAYS = 3650;

/** Hard cap on principal to keep float math in a safe range. */
export const MAX_PRINCIPAL_USD = 10_000_000;

/**
 * Project compound interest on `principalAmount` held for
 * `estimatedHoldingDays` at `aprPercent` annual rate.
 *
 * Formula: principal * ((1 + apr/100/DAYS_PER_YEAR) ^ days - 1)
 *
 * Returns zeroed values for non-finite or non-positive inputs so the UI
 * never shows NaN or negative projections.
 */
export function projectYield(input: {
  principalAmount: number;
  estimatedHoldingDays: number;
  aprPercent?: number;
}): YieldProjectionCalculation {
  const principalAmount = Number(input.principalAmount);
  const estimatedHoldingDays = Number(input.estimatedHoldingDays);
  const aprPercent = input.aprPercent ?? BLEND_PROJECTION_APR_PERCENT;

  if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
    return {
      principalAmount: 0,
      estimatedHoldingDays: 0,
      aprPercent: Number.isFinite(aprPercent) ? aprPercent : 0,
      projectedEarningsUsd: 0,
    };
  }
  if (!Number.isFinite(estimatedHoldingDays) || estimatedHoldingDays <= 0) {
    return {
      principalAmount,
      estimatedHoldingDays: 0,
      aprPercent: Number.isFinite(aprPercent) ? aprPercent : 0,
      projectedEarningsUsd: 0,
    };
  }
  if (!Number.isFinite(aprPercent) || aprPercent < 0) {
    return {
      principalAmount,
      estimatedHoldingDays,
      aprPercent: 0,
      projectedEarningsUsd: 0,
    };
  }

  const days = Math.min(Math.floor(estimatedHoldingDays), MAX_HOLDING_DAYS);
  const principal = Math.min(principalAmount, MAX_PRINCIPAL_USD);
  const dailyRate = aprPercent / 100 / DAYS_PER_YEAR;
  const projectedEarningsUsd = principal * (Math.pow(1 + dailyRate, days) - 1);

  return {
    principalAmount: principal,
    estimatedHoldingDays: days,
    aprPercent,
    projectedEarningsUsd: Number.isFinite(projectedEarningsUsd)
      ? Math.round(projectedEarningsUsd * 100) / 100
      : 0,
  };
}

/** Default holding days shown by the calculator slider (30). */
export const DEFAULT_HOLDING_DAYS = 30;

/** Minimum holding days on the slider. */
export const MIN_HOLDING_DAYS = 1;

/** Maximum holding days on the slider. */
export const SLIDER_MAX_HOLDING_DAYS = 365;

/**
 * Risk disclaimer shown next to the projection. Yield from a third-party
 * Soroban protocol is an estimate, not a guarantee.
 */
export const YIELD_PROJECTION_DISCLAIMER =
  "Projected earnings are estimates based on Blend's current ~4.5% APY. Actual yield varies with protocol utilization and is not guaranteed. Supplying escrowed funds to Blend uses a third-party Soroban smart contract that can fail.";
