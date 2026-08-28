import type { Order } from "@delegolabs/types";
import { rejectionReasonLabel } from "./rejectionReasons";

/**
 * Shareable weekly report data (#617): period-over-period KPI deltas, top
 * delegations by spend, and notable events (disputes, rejections) — all
 * computed client-side from the orders already loaded via useOrders, so
 * no new endpoint is required.
 */

const STROOPS_PER_XLM = 10_000_000n;

/** An order counts as spend once it's past pending_approval, matching lib/analytics.ts's isSpend threshold. */
const SPEND_STATUSES = new Set<Order["status"]>([
  "approved",
  "escrowed",
  "fulfilled",
  "settled",
  "completed",
]);

function isSpendOrder(order: Order): boolean {
  return SPEND_STATUSES.has(order.status);
}

function orderTimestamp(order: Order): number {
  return new Date(order.createdAt).getTime();
}

export interface KpiDelta {
  label: string;
  current: number;
  previous: number;
  /** Percentage change from previous to current; null when previous is 0 (undefined % change). */
  percentChange: number | null;
}

export interface DelegationSpendRow {
  delegationId: string;
  totalStroops: bigint;
  orderCount: number;
}

export interface NotableEvent {
  type: "dispute_opened" | "rejection";
  orderId: string;
  delegationId: string;
  detail: string;
  timestamp: string;
}

export interface WeeklyReport {
  periodStart: Date;
  periodEnd: Date;
  weekCount: number;
  totalSpendStroops: KpiDelta & { unit: "stroops" };
  orderCount: KpiDelta;
  topDelegations: DelegationSpendRow[];
  notableEvents: NotableEvent[];
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

/**
 * Builds a weekly report comparing `[periodEnd - weekCount weeks, periodEnd)`
 * against the equal-length period immediately before it.
 */
export function buildWeeklyReport(
  orders: Order[],
  periodEnd: Date,
  weekCount: number
): WeeklyReport {
  const periodMs = weekCount * 7 * 24 * 60 * 60 * 1000;
  const periodStart = new Date(periodEnd.getTime() - periodMs);
  const previousPeriodStart = new Date(periodStart.getTime() - periodMs);

  const inCurrentPeriod = (o: Order) => {
    const t = orderTimestamp(o);
    return t >= periodStart.getTime() && t < periodEnd.getTime();
  };
  const inPreviousPeriod = (o: Order) => {
    const t = orderTimestamp(o);
    return t >= previousPeriodStart.getTime() && t < periodStart.getTime();
  };

  const currentOrders = orders.filter(inCurrentPeriod);
  const previousOrders = orders.filter(inPreviousPeriod);

  const currentSpend = currentOrders
    .filter(isSpendOrder)
    .reduce((sum, o) => sum + BigInt(o.totalStroops ?? 0), 0n);
  const previousSpend = previousOrders
    .filter(isSpendOrder)
    .reduce((sum, o) => sum + BigInt(o.totalStroops ?? 0), 0n);

  const currentSpendXlm = Number(currentSpend) / Number(STROOPS_PER_XLM);
  const previousSpendXlm = Number(previousSpend) / Number(STROOPS_PER_XLM);

  const byDelegation = new Map<string, DelegationSpendRow>();
  for (const order of currentOrders.filter(isSpendOrder)) {
    const existing = byDelegation.get(order.delegationId) ?? {
      delegationId: order.delegationId,
      totalStroops: 0n,
      orderCount: 0,
    };
    existing.totalStroops += BigInt(order.totalStroops ?? 0);
    existing.orderCount += 1;
    byDelegation.set(order.delegationId, existing);
  }
  const topDelegations = [...byDelegation.values()]
    .sort((a, b) => (b.totalStroops > a.totalStroops ? 1 : -1))
    .slice(0, 5);

  const notableEvents: NotableEvent[] = currentOrders
    .filter((o) => o.status === "disputed" || o.status === "rejected")
    .map((o) => ({
      type: (o.status === "disputed" ? "dispute_opened" : "rejection") as NotableEvent["type"],
      orderId: o.id,
      delegationId: o.delegationId,
      detail:
        o.status === "disputed"
          ? "Dispute opened"
          : [rejectionReasonLabel(o.rejectionReason), o.rejectionNote]
              .filter(Boolean)
              .join(": ") || "Rejected (no reason recorded)",
      timestamp: new Date(o.createdAt).toISOString(),
    }))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return {
    periodStart,
    periodEnd,
    weekCount,
    totalSpendStroops: {
      label: "Total spend",
      current: currentSpendXlm,
      previous: previousSpendXlm,
      percentChange: percentChange(currentSpendXlm, previousSpendXlm),
      unit: "stroops",
    },
    orderCount: {
      label: "Orders",
      current: currentOrders.length,
      previous: previousOrders.length,
      percentChange: percentChange(currentOrders.length, previousOrders.length),
    },
    topDelegations,
    notableEvents,
  };
}

/** Plain-text rendering for "Copy summary as text" — survives markdown-strip into an email body legibly. */
export function formatReportAsText(report: WeeklyReport): string {
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const pct = (delta: KpiDelta) =>
    delta.percentChange === null
      ? "n/a"
      : `${delta.percentChange >= 0 ? "+" : ""}${delta.percentChange.toFixed(1)}%`;

  const lines: string[] = [
    `Weekly Report: ${fmt(report.periodStart)} - ${fmt(report.periodEnd)}`,
    "",
    `Total spend: ${report.totalSpendStroops.current.toFixed(2)} XLM (${pct(report.totalSpendStroops)} vs prior period)`,
    `Orders: ${report.orderCount.current} (${pct(report.orderCount)} vs prior period)`,
    "",
    "Top delegations:",
  ];

  if (report.topDelegations.length === 0) {
    lines.push("  (none)");
  } else {
    for (const row of report.topDelegations) {
      const xlm = Number(row.totalStroops) / Number(STROOPS_PER_XLM);
      lines.push(`  - ${row.delegationId}: ${xlm.toFixed(2)} XLM (${row.orderCount} orders)`);
    }
  }

  lines.push("", "Notable events:");
  if (report.notableEvents.length === 0) {
    lines.push("  (none)");
  } else {
    for (const event of report.notableEvents) {
      lines.push(`  - [${event.orderId}] ${event.detail}`);
    }
  }

  return lines.join("\n");
}
