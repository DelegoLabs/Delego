/**
 * Category-based budget allocation within a parent delegation limit (#716).
 * All amounts are stroops strings on the wire and bigint in the math.
 */

export interface CategoryBudget {
  category: string;
  allocatedStroops: string;
  spentStroops: string;
  limitPeriod: "monthly" | "weekly";
}

export function toStroops(value: string | undefined): bigint {
  const trimmed = value?.trim() ?? "";
  return /^\d+$/.test(trimmed) ? BigInt(trimmed) : 0n;
}

export function totalAllocated(budgets: CategoryBudget[]): bigint {
  return budgets.reduce((sum, b) => sum + toStroops(b.allocatedStroops), 0n);
}

/** Largest allocation category `index` can take without the sum exceeding the parent limit. */
export function maxAllocationFor(
  budgets: CategoryBudget[],
  index: number,
  parentLimitStroops: bigint
): bigint {
  const others = totalAllocated(budgets) - toStroops(budgets[index]?.allocatedStroops);
  const headroom = parentLimitStroops - others;
  return headroom > 0n ? headroom : 0n;
}

/**
 * Returns a copy of `budgets` with category `index` set to `requested`,
 * clamped to [0, headroom] so the total never exceeds the parent limit.
 */
export function setAllocation(
  budgets: CategoryBudget[],
  index: number,
  requested: bigint,
  parentLimitStroops: bigint
): CategoryBudget[] {
  const max = maxAllocationFor(budgets, index, parentLimitStroops);
  const clamped = requested < 0n ? 0n : requested > max ? max : requested;
  return budgets.map((b, i) =>
    i === index ? { ...b, allocatedStroops: clamped.toString() } : b
  );
}

/** Percentage (0–100, one decimal) of `part` relative to `whole`. */
export function percentOf(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * 1000n) / whole) / 10;
}

export interface BudgetValidation {
  valid: boolean;
  overBy: bigint;
  error?: string;
}

export function validateBudgets(
  budgets: CategoryBudget[],
  parentLimitStroops: bigint
): BudgetValidation {
  const total = totalAllocated(budgets);
  if (total > parentLimitStroops) {
    return {
      valid: false,
      overBy: total - parentLimitStroops,
      error: "Category budgets add up to more than the delegation's spending limit.",
    };
  }
  return { valid: true, overBy: 0n };
}

export type BudgetUsageTone = "ok" | "warning" | "over";

/** Colour band for a category's spend against its own allocation. */
export function usageTone(budget: CategoryBudget): BudgetUsageTone {
  const allocated = toStroops(budget.allocatedStroops);
  const spent = toStroops(budget.spentStroops);
  if (allocated === 0n) return spent > 0n ? "over" : "ok";
  if (spent > allocated) return "over";
  return spent * 100n >= allocated * 80n ? "warning" : "ok";
}

/** Fixed palette for the distribution bar; cycles when there are more categories. */
export const CATEGORY_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
  "#84cc16",
];

export function categoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}
