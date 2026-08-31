"use client";

import dynamic from "next/dynamic";
import type { SpendBucket } from "../../lib/analytics";
import { isEmptySeries } from "../../lib/analytics";
import { formatXlm } from "../../lib/orders";
import { useDataSaver } from "../../hooks/useDataSaver";

export interface SpendChartProps {
  buckets: SpendBucket[];
  locale?: string;
}

/**
 * recharts is a sizeable dependency the initial bundle shouldn't pay for on
 * every route (FE-005) — dynamically imported so it lands in its own chunk,
 * fetched only when the analytics page actually renders a chart.
 */
const SpendChartInner = dynamic(() => import("./SpendChartInner"), {
  ssr: false,
  loading: () => <SpendChartSkeleton />,
});

/** Fixed-height placeholder matching the chart's rendered size, so the chunk loading in doesn't shift layout (avoids CLS). */
function SpendChartSkeleton() {
  return <div className="spend-chart-skeleton" aria-hidden="true" />;
}

/**
 * Reduced-mode fallback (#623): instead of paying recharts' bundle/render
 * cost, show the same information as plain summary numbers — total spend
 * and the highest single bucket, which is what a chart mainly communicates
 * at a glance anyway.
 */
function SpendSummaryNumbers({ buckets, locale }: SpendChartProps) {
  const total = buckets.reduce((sum, b) => sum + b.totalStroops, 0n);
  const peak = buckets.reduce(
    (max, b) => (b.totalStroops > max.totalStroops ? b : max),
    buckets[0]
  );

  return (
    <div className="spend-chart-summary" data-testid="spend-chart-summary">
      <div className="spend-chart-summary-stat">
        <span className="spend-chart-summary-label">Total spend</span>
        <strong>{formatXlm(total, locale)} XLM</strong>
      </div>
      <div className="spend-chart-summary-stat">
        <span className="spend-chart-summary-label">Highest ({peak.label})</span>
        <strong>{formatXlm(peak.totalStroops, locale)} XLM</strong>
      </div>
    </div>
  );
}

export function SpendChart({ buckets, locale }: SpendChartProps) {
  const { reducedModeActive } = useDataSaver();

  if (isEmptySeries(buckets)) {
    return (
      <div className="spend-chart-empty">
        <p>No spending in the selected range.</p>
      </div>
    );
  }

  if (reducedModeActive) {
    return <SpendSummaryNumbers buckets={buckets} locale={locale} />;
  }

  return <SpendChartInner buckets={buckets} locale={locale} />;
}
