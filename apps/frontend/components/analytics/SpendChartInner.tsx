"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import type { SpendBucket } from "../../lib/analytics";
import { formatXlm } from "../../lib/orders";

export interface SpendChartInnerProps {
  buckets: SpendBucket[];
  locale?: string;
}

interface ChartDatum {
  label: string;
  valueXlm: number;
  totalStroops: bigint;
}

function SpendTooltip({
  active,
  payload,
  locale,
}: TooltipProps<number, string> & { locale?: string }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload as ChartDatum;
  return (
    <div className="spend-chart-tooltip">
      <p className="spend-chart-tooltip-label">{datum.label}</p>
      <p className="spend-chart-tooltip-value">
        {formatXlm(datum.totalStroops, locale)} XLM
      </p>
    </div>
  );
}

/**
 * The actual recharts implementation — only ever loaded via
 * SpendChart's dynamic import, so recharts never lands in the initial
 * bundle (FE-005 budget).
 */
export default function SpendChartInner({
  buckets,
  locale,
}: SpendChartInnerProps) {
  const data: ChartDatum[] = buckets.map((bucket) => ({
    label: bucket.label,
    valueXlm: Number(bucket.totalStroops) / 10_000_000,
    totalStroops: bucket.totalStroops,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="label"
          tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
          axisLine={{ stroke: "var(--color-border)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip
          content={(props: any) => <SpendTooltip {...props} locale={locale} />}
          cursor={{ fill: "var(--color-bg-subtle)" }}
        />
        <Bar
          dataKey="valueXlm"
          fill="var(--color-chart-blue)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
