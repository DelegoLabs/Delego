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
  actualXlm: number | undefined;
  forecastXlm: number | undefined;
  confidenceUpperXlm: number | undefined;
  confidenceLowerXlm: number | undefined;
  bandBaseXlm: number | undefined;
  bandHeightXlm: number | undefined;
  budgetXlm: number | undefined;
  actualStroops: number;
  forecastStroops: number;
  confidenceUpperStroops: number;
  confidenceLowerStroops: number;
}

function toXlm(value: number): number {
  return value / 10_000_000;
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
      <p className="spend-chart-tooltip-value">
        Actual: {formatXlm(BigInt(Math.round(datum.actualStroops)), locale)} XLM
      </p>
      <p className="spend-chart-tooltip-value">
        Forecast: {formatXlm(BigInt(Math.round(datum.forecastStroops)), locale)} XLM
      </p>
      <p className="spend-chart-tooltip-value">
        Confidence: {formatXlm(BigInt(Math.round(datum.confidenceLowerStroops)), locale)} – {formatXlm(BigInt(Math.round(datum.confidenceUpperStroops)), locale)} XLM
      </p>
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
  const data: ChartDatum = points.map((point) => {
    const actual = parseStroops(point.actualSpend);
    const forecast = parseStroops(point.forecastSpend);
    const upper = parseStroops(point.confidenceUpper);
    const lower = parseStroops(point.confidenceLower);
    const actualXlm = toXlm(actual);
    const forecastXlm = toXlm(forecast);
    const upperXlm = toXlm(upper);
    const lowerXlm = toXlm(lower);
    return {
      date: point.date,
      actualXlm,
      forecastXlm,
      confidenceUpperXlm: upperXlm,
      confidenceLowerXlm: lowerXlm,
      bandBaseXlm: lowerXlm,
      bandHeightXlm: upperXlm - lowerXlm,
      budgetXlm: undefined,
      actualStroops: actual,
      forecastStroops: forecast,
      confidenceUpperStroops: upper,
      confidenceLowerStroops: lower,
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
          dataKey="bandBaseXlm"
          stackId="confidence"
          stroke="none"
          fill="transparent"
          connectNulls={false}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="bandHeightXlm"
          stackId="confidence"
          name="Confidence interval"
          stroke="none"
          fill="var(--color-chart-purple)"
          fillOpacity={0.15}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="actualXlm"
          name="Actual spend"
          stroke="var(--color-chart-blue)"
          fill="var(--color-chart-blue)"
          fillOpacity={0.25}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="forecastXlm"
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
