"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import type { SpendForecastPoint } from "../../lib/spendForecast";
import { parseStroops, stroopsToXlm } from "../../lib/spendForecast";
import { formatXlm } from "../../lib/orders";

export interface SpendForecastChartInnerProps {
  points: SpendForecastPoint[];
  firstBreachDate: string | null;
  locale?: string;
}

interface ChartDatum {
  date: string;
  historicalXlm?: number;
  projectedXlm?: number;
  budgetXlm?: number;
  historical: bigint | null;
  projected: bigint | null;
  budget: bigint | null;
}

function toXlm(value: bigint | null): number | undefined {
  return value === null ? undefined : stroopsToXlm(value);
}

function ForecastTooltip({
  active,
  payload,
  locale,
}: TooltipProps<number, string> & { locale?: string }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload as ChartDatum;
  return (
    <div className="spend-chart-tooltip">
      <p className="spend-chart-tooltip-label">{datum.date}</p>
      {datum.historical !== null && (
        <p className="spend-chart-tooltip-value">
          Actual: {formatXlm(datum.historical, locale)} XLM
        </p>
      )}
      {datum.projected !== null && (
        <p className="spend-chart-tooltip-value">
          Projected: {formatXlm(datum.projected, locale)} XLM
        </p>
      )}
      {datum.budget !== null && (
        <p className="spend-chart-tooltip-value">
          Limit: {formatXlm(datum.budget, locale)} XLM
        </p>
      )}
    </div>
  );
}

/**
 * Recharts implementation of the spend forecast — only loaded through
 * SpendForecastChart's dynamic import (FE-005 bundle budget).
 */
export default function SpendForecastChartInner({
  points,
  firstBreachDate,
  locale,
}: SpendForecastChartInnerProps) {
  const data: ChartDatum[] = points.map((point) => {
    const historical = parseStroops(point.historicalSpentStroops);
    const projected = parseStroops(point.projectedSpentStroops);
    const budget = parseStroops(point.budgetLimitStroops);
    return {
      date: point.date,
      historicalXlm: toXlm(historical),
      projectedXlm: toXlm(projected),
      budgetXlm: toXlm(budget),
      historical,
      projected,
      budget,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="date"
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
          content={(props: any) => <ForecastTooltip {...props} locale={locale} />}
        />
        <Area
          type="monotone"
          dataKey="historicalXlm"
          name="Actual spend"
          stroke="var(--color-chart-blue)"
          fill="var(--color-chart-blue)"
          fillOpacity={0.25}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="projectedXlm"
          name="Projected spend"
          stroke="var(--color-chart-purple)"
          strokeDasharray="6 4"
          fill="var(--color-chart-purple)"
          fillOpacity={0.1}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Line
          type="stepAfter"
          dataKey="budgetXlm"
          name="Monthly limit"
          stroke="var(--color-error-text)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        {firstBreachDate && (
          <ReferenceLine
            x={firstBreachDate}
            stroke="var(--color-error-text)"
            strokeDasharray="2 2"
            label={{
              value: "Limit breach",
              position: "insideTopRight",
              fill: "var(--color-error-text)",
              fontSize: 11,
            }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
