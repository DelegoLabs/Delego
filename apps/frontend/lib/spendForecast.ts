/**
 * Predictive end-of-month spend forecast (#721).
 *
 * Each point carries either the actual spend to date (`historicalSpentStroops`)
 * or the projected spend from the agent's trajectory plus scheduled
 * subscriptions (`projectedSpentStroops`) — the point where history ends
 * usually carries both so the two series join up on the chart.
 */

export interface SpendForecastPoint {
  date: string;
  historicalSpentStroops?: string;
  projectedSpentStroops?: string;
  budgetLimitStroops: string;
}

export interface SpendForecastSummary {
  /** Latest actual spend, or null when no historical points exist. */
  spentToDateStroops: bigint | null;
  /** Spend at the last projected point (end of month), or null when there is no projection. */
  projectedEndStroops: bigint | null;
  /** Budget limit at the final point of the series. */
  budgetLimitStroops: bigint;
  /** True when any projected point goes over its budget limit. */
  projectedBreach: boolean;
  /** Date of the first projected point over the limit, if any. */
  firstBreachDate: string | null;
}

const STROOPS_PER_XLM = 10_000_000;

/** Parses a stroops string; returns null for missing or malformed values. */
export function parseStroops(value: string | undefined): bigint | null {
  if (value == null || !/^\d+$/.test(value.trim())) return null;
  return BigInt(value.trim());
}

export function stroopsToXlm(stroops: bigint): number {
  return Number(stroops) / STROOPS_PER_XLM;
}

export function summarizeSpendForecast(
  points: SpendForecastPoint[]
): SpendForecastSummary {
  let spentToDateStroops: bigint | null = null;
  let projectedEndStroops: bigint | null = null;
  let firstBreachDate: string | null = null;

  for (const point of points) {
    const historical = parseStroops(point.historicalSpentStroops);
    if (historical !== null) spentToDateStroops = historical;

    const projected = parseStroops(point.projectedSpentStroops);
    if (projected === null) continue;
    projectedEndStroops = projected;

    const limit = parseStroops(point.budgetLimitStroops);
    if (firstBreachDate === null && limit !== null && projected > limit) {
      firstBreachDate = point.date;
    }
  }

  const last = points[points.length - 1];
  return {
    spentToDateStroops,
    projectedEndStroops,
    budgetLimitStroops: parseStroops(last?.budgetLimitStroops) ?? 0n,
    projectedBreach: firstBreachDate !== null,
    firstBreachDate,
  };
}

export function isEmptyForecast(points: SpendForecastPoint[]): boolean {
  return !points.some(
    (p) =>
      parseStroops(p.historicalSpentStroops) !== null ||
      parseStroops(p.projectedSpentStroops) !== null
  );
}
