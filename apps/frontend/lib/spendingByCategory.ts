/**
 * Buyer spending analytics breakdown by category and agent session (#989).
 *
 * Pure, side-effect-free computation over already-fetched orders and
 * delegations — same shape as lib/analytics.ts and lib/spendForecast.ts so it
 * can be unit tested in isolation and shared by the analytics chart/legend.
 *
 * "Autonomous" spend is authorized by an agent whose delegation permission
 * level lets it spend without a per-transaction human approval (AUTO_APPROVE
 * or ADMIN); every other level is a human-in-the-loop "manual" checkout.
 */

import type { Delegation, Order } from "@delegolabs/types";
import { ORDER_LIFECYCLE, lifecycleIndex } from "./orders";
import { UNCATEGORIZED, orderCategory } from "./expenseReportBuilder";

export interface BuyerSpendingCategory {
  category: string;
  totalSpentStroops: string;
  percentageOfTotal: number;
  autonomousSpendStroops: string;
  manualSpendStroops: string;
}

export type SpendingCategoryRange = "current_month" | "last_30_days" | "ytd";

/**
 * Which slice of the spend a view is showing: everything, only spend an
 * autonomous agent session authorized, or only spend a human approved.
 */
export type SpendMode = "all" | "autonomous" | "manual";

export const SPENDING_CATEGORY_RANGES: readonly SpendingCategoryRange[] = [
  "current_month",
  "last_30_days",
  "ytd",
];

export const DEFAULT_SPENDING_CATEGORY_RANGE: SpendingCategoryRange =
  "current_month";

export const SPENDING_CATEGORY_RANGE_LABELS: Record<
  SpendingCategoryRange,
  string
> = {
  current_month: "Current Month",
  last_30_days: "Last 30 Days",
  ytd: "Year-to-Date",
};

export const SPEND_MODE_LABELS: Record<SpendMode, string> = {
  all: "All",
  autonomous: "Autonomous",
  manual: "Manual",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Narrows a URL search param into a range, falling back to the default. */
export function parseSpendingCategoryRange(
  value: string | null
): SpendingCategoryRange {
  return (SPENDING_CATEGORY_RANGES as readonly string[]).includes(value ?? "")
    ? (value as SpendingCategoryRange)
    : DEFAULT_SPENDING_CATEGORY_RANGE;
}

/**
 * Reads a stroop amount off a loosely-typed order field. Orders carry stroops
 * as a bigint in the domain model, but the wire format is a string and older
 * fixtures use plain numbers — anything unparseable counts as zero rather than
 * throwing inside a render.
 */
function toStroops(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? BigInt(Math.trunc(value)) : 0n;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return /^\d+$/.test(trimmed) ? BigInt(trimmed) : 0n;
  }
  return 0n;
}

/**
 * Round `part/whole` to the nearest tenth of a percent, using integer math
 * only so it never loses precision on large stroop amounts.
 *
 * Distinct from `percentOf` in lib/categoryBudgets.ts, which truncates: the
 * shares shown next to a donut slice should add up to 100%, and rounding is
 * what keeps them closest to it.
 */
export function percentOfTotal(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number(((part * 10_000n) / whole + 5n) / 10n) / 10;
}

/** An order counts as spend once it reaches "approved" on the happy path. */
const SPEND_THRESHOLD_INDEX = ORDER_LIFECYCLE.indexOf("approved");

function isSpend(order: Order): boolean {
  return lifecycleIndex(order.status) >= SPEND_THRESHOLD_INDEX;
}

const AUTONOMOUS_PERMISSION_LEVELS = new Set(["AUTO_APPROVE", "ADMIN"]);

function isAutonomous(delegation: Delegation | undefined): boolean {
  return (
    delegation?.permissionLevel != null &&
    AUTONOMOUS_PERMISSION_LEVELS.has(delegation.permissionLevel)
  );
}

function rangeStart(range: SpendingCategoryRange, now: Date): Date {
  switch (range) {
    case "current_month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "last_30_days":
      return new Date(now.getTime() - 29 * DAY_MS);
    case "ytd":
      return new Date(now.getFullYear(), 0, 1);
  }
}

interface CategoryAccumulator {
  total: bigint;
  autonomous: bigint;
  manual: bigint;
}

/**
 * Groups spend by product category within `range`, splitting each category
 * into autonomous vs manual spend. Only orders past `approved` count as spend,
 * and orders outside the range are ignored. Results are sorted by total spend
 * descending.
 */
export function computeSpendingByCategory(
  orders: Order[],
  delegations: Delegation[],
  range: SpendingCategoryRange,
  options: { now?: Date } = {}
): BuyerSpendingCategory[] {
  const now = options.now ?? new Date();
  const start = rangeStart(range, now);

  const byId = new Map(delegations.map((d) => [d.id, d]));
  const accumulators = new Map<string, CategoryAccumulator>();

  for (const order of orders) {
    if (!isSpend(order)) continue;

    const createdAt = new Date(order.createdAt);
    if (createdAt < start || createdAt > now) continue;

    const delegation = byId.get(order.delegationId);
    const amount = toStroops(order.totalStroops);
    if (amount <= 0n) continue;

    const category = orderCategory(order) || UNCATEGORIZED;

    const acc = accumulators.get(category) ?? {
      total: 0n,
      autonomous: 0n,
      manual: 0n,
    };
    acc.total += amount;
    if (isAutonomous(delegation)) acc.autonomous += amount;
    else acc.manual += amount;
    accumulators.set(category, acc);
  }

  let grandTotal = 0n;
  for (const acc of accumulators.values()) grandTotal += acc.total;

  return Array.from(accumulators.entries())
    .map(([category, acc]) => ({
      category,
      totalSpentStroops: acc.total.toString(),
      percentageOfTotal: percentOfTotal(acc.total, grandTotal),
      autonomousSpendStroops: acc.autonomous.toString(),
      manualSpendStroops: acc.manual.toString(),
    }))
    .sort((a, b) => {
      const aTotal = BigInt(a.totalSpentStroops);
      const bTotal = BigInt(b.totalSpentStroops);
      return aTotal < bTotal ? 1 : aTotal > bTotal ? -1 : 0;
    });
}

/** Spend a category contributed under the given mode. */
export function amountForMode(
  category: BuyerSpendingCategory,
  mode: SpendMode
): bigint {
  if (mode === "autonomous") return BigInt(category.autonomousSpendStroops);
  if (mode === "manual") return BigInt(category.manualSpendStroops);
  return BigInt(category.totalSpentStroops);
}

/**
 * Re-bases a category breakdown onto one spend mode: the totals and the
 * percentages are recomputed against that mode's grand total, so the donut
 * slices and the legend percentages always describe the same slice of spend.
 *
 * The original ordering (by total spend) is preserved so toggling a mode
 * doesn't shuffle the chart under the user's cursor.
 */
export function spendingForMode(
  categories: BuyerSpendingCategory[],
  mode: SpendMode
): BuyerSpendingCategory[] {
  if (mode === "all") return categories;

  let modeTotal = 0n;
  for (const category of categories) {
    modeTotal += amountForMode(category, mode);
  }

  return categories.map((category) => {
    const amount = amountForMode(category, mode);
    return {
      ...category,
      totalSpentStroops: amount.toString(),
      percentageOfTotal: percentOfTotal(amount, modeTotal),
    };
  });
}
