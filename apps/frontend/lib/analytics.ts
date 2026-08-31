import type { Order } from "@delegolabs/types";
import { ORDER_LIFECYCLE, lifecycleIndex } from "./orders";

export type AnalyticsRange = "7d" | "30d" | "90d";

export const ANALYTICS_RANGES: readonly AnalyticsRange[] = ["7d", "30d", "90d"];
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = "30d";

const RANGE_DAYS: Record<AnalyticsRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PeriodMetrics {
  spend: bigint;
  orderCount: number;
  avgOrderValue: bigint;
  approvalRate: number;
}

export interface Deltas {
  spendDelta: number | null;
  orderCountDelta: number | null;
  avgOrderValueDelta: number | null;
  approvalRateDelta: number | null;
}

/** Narrows a URL search param into an AnalyticsRange, falling back to the default for anything else (missing, typo'd, tampered with). */
export function parseAnalyticsRange(value: string | null): AnalyticsRange {
  return (ANALYTICS_RANGES as readonly string[]).includes(value ?? "")
    ? (value as AnalyticsRange)
    : DEFAULT_ANALYTICS_RANGE;
}

/** 90D buckets by week (would otherwise be 90 bars); 7D/30D bucket by day. */
export function bucketUnitForRange(range: AnalyticsRange): "day" | "week" {
  return range === "90d" ? "week" : "day";
}

/** An order counts as spend once it's past pending_approval on the happy path — matches the "approved" half of the derived approval-decision logic in lib/export.ts. */
const SPEND_THRESHOLD_INDEX = ORDER_LIFECYCLE.indexOf("approved");
function isSpend(order: Order): boolean {
  const idx = lifecycleIndex(order.status);
  return idx >= SPEND_THRESHOLD_INDEX;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Monday-start week bucket. */
function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function bucketStart(date: Date, unit: "day" | "week"): Date {
  return unit === "week" ? startOfWeek(date) : startOfDay(date);
}

function advance(date: Date, unit: "day" | "week"): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + (unit === "week" ? 7 : 1));
  return d;
}

export interface SpendBucket {
  /** ISO date string identifying the bucket (day or week start), stable for use as a chart/key value. */
  bucketStart: string;
  /** Short display label, e.g. "Aug 18" or "Aug 18 – Aug 24". */
  label: string;
  totalStroops: bigint;
}

/**
 * Buckets order totals into per-day (7D/30D) or per-week (90D) spend,
 * zero-filling every bucket in range so gaps in activity don't create holes
 * in the chart. Only orders past `pending_approval` on the happy path count
 * as spend (see `isSpend`) — pending/draft/cancelled/disputed orders never
 * became real spend.
 *
 * `locale` follows the FE-039 convention used by `formatXlm` in
 * lib/orders.ts: pass `useLocale()`'s value to format bucket labels for the
 * active app language instead of the browser default.
 */
export function spendByRange(
  orders: Order[],
  range: AnalyticsRange,
  options: { now?: Date; locale?: string } = {}
): SpendBucket[] {
  const now = options.now ?? new Date();
  const unit = bucketUnitForRange(range);
  const rangeStart = bucketStart(
    new Date(now.getTime() - (RANGE_DAYS[range] - 1) * DAY_MS),
    unit
  );

  const totals = new Map<string, bigint>();
  for (let cursor = rangeStart; cursor <= now; cursor = advance(cursor, unit)) {
    totals.set(cursor.toISOString(), 0n);
  }

  for (const order of orders) {
    if (!isSpend(order)) continue;
    if (order.createdAt < rangeStart || order.createdAt > now) continue;
    const key = bucketStart(order.createdAt, unit).toISOString();
    // Orders can't predate the earliest bucket we seeded (checked above), so this is always present.
    totals.set(key, (totals.get(key) ?? 0n) + order.totalStroops);
  }

  const dayFormatter = new Intl.DateTimeFormat(options.locale, {
    month: "short",
    day: "numeric",
  });

  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, totalStroops]) => {
      const start = new Date(iso);
      let label = dayFormatter.format(start);
      if (unit === "week") {
        const weekEnd = new Date(start);
        weekEnd.setDate(weekEnd.getDate() + 6);
        label = `${dayFormatter.format(start)} – ${dayFormatter.format(weekEnd)}`;
      }
      return { bucketStart: iso, label, totalStroops };
    });
}

/** True when every bucket in the series is zero — drives the chart's empty-range state. */
export function isEmptySeries(buckets: SpendBucket[]): boolean {
  return buckets.every((bucket) => bucket.totalStroops === 0n);
}

function getPeriodMetrics(orders: Order[], startDate: Date, endDate: Date): PeriodMetrics {
  const periodOrders = orders.filter(o => o.createdAt >= startDate && o.createdAt < endDate);
  
  let spend = 0n;
  let spendOrderCount = 0;
  let approvedCount = 0;

  for (const order of periodOrders) {
    if (isSpend(order)) {
      spend += order.totalStroops;
      spendOrderCount++;
    }
    const idx = lifecycleIndex(order.status);
    if (idx >= ORDER_LIFECYCLE.indexOf("approved")) {
      approvedCount++;
    }
  }

  return {
    spend,
    orderCount: periodOrders.length,
    avgOrderValue: spendOrderCount > 0 ? spend / BigInt(spendOrderCount) : 0n,
    approvalRate: periodOrders.length > 0 ? approvedCount / periodOrders.length : 0
  };
}

export function calculateDeltas(orders: Order[], range: AnalyticsRange, now: Date = new Date()): { current: PeriodMetrics, previous: PeriodMetrics, deltas: Deltas } {
  const days = RANGE_DAYS[range];
  
  const currentStart = new Date(now.getTime() - days * DAY_MS);
  const previousStart = new Date(currentStart.getTime() - days * DAY_MS);

  const current = getPeriodMetrics(orders, currentStart, now);
  const previous = getPeriodMetrics(orders, previousStart, currentStart);

  const calcDelta = (curr: number, prev: number) => {
    if (prev === 0) return null;
    return (curr - prev) / prev;
  };

  const calcBigIntDelta = (curr: bigint, prev: bigint) => {
    if (prev === 0n) return null;
    return Number(curr - prev) / Number(prev);
  };

  return {
    current,
    previous,
    deltas: {
      spendDelta: calcBigIntDelta(current.spend, previous.spend),
      orderCountDelta: calcDelta(current.orderCount, previous.orderCount),
      avgOrderValueDelta: calcBigIntDelta(current.avgOrderValue, previous.avgOrderValue),
      approvalRateDelta: previous.orderCount > 0 ? current.approvalRate - previous.approvalRate : null
    }
  };
}
