/**
 * Monthly category budget allocations for the settings surface.
 * Amounts are bigint stroops so arithmetic stays exact.
 */

export interface CategoryBudgetAllocation {
  category: string;
  monthlyLimitStroops: bigint;
  currentSpentStroops: bigint;
}

export const EMPTY_ALLOCATION: CategoryBudgetAllocation = {
  category: "",
  monthlyLimitStroops: 0n,
  currentSpentStroops: 0n,
};

/** Total monthly limit across every category. */
export function totalLimit(allocations: CategoryBudgetAllocation[]): bigint {
  return allocations.reduce((sum, a) => sum + a.monthlyLimitStroops, 0n);
}

/** Total already spent this month across every category. */
export function totalSpent(allocations: CategoryBudgetAllocation[]): bigint {
  return allocations.reduce((sum, a) => sum + a.currentSpentStroops, 0n);
}

/**
 * Share of its own limit a category has used, 0-100. Capped at 100 so an
 * over-budget category reads as "full" rather than overflowing the bar.
 */
export function usedPercent(allocation: CategoryBudgetAllocation): number {
  if (allocation.monthlyLimitStroops <= 0n) return 0;
  const ratio = Number((allocation.currentSpentStroops * 100n) / allocation.monthlyLimitStroops);
  return Math.max(0, Math.min(100, ratio));
}
