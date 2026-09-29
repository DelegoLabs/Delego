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
import { formatForecastXLm } from "../../lib/spendForecast";

export interface SpendForecastChartInnerProps {
  points: SpendForecastPoint[];
  firstBreachDate: string | null;
  locale?: string;
}

interface ChartDatum {
  date: string;
  actualSpend: number;
  forecastSpend?: number;
  confidenceUpper?: number;
  confidenceLower?: number;
  confidenceBand?: [number, number];
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
        Actual: {formatForecastXLm(datum.actualSpend, locale)} XLM
      </p>
      {datum.forecastSpend !== undefined && (
        <p className="spend-chart-tooltip-value">
          Forecast: {formatForecastXLm(datum.forecastSpend, locale)} XLM
        </p>
      )}
      {datum.confidenceUpper !== undefined &&
        datum.confidenceLower !== undefined && (
          <p className="spend-chart-tooltip-value">
            Confidence: {formatForecastXLm(datum.confidenceLower, locale)} – {
              formatForecastXlm(datum.confidenceUpper, locale)
            } XLM
          </p>
        )}
    </div>
  );
}

/**
 * Recharts implementation of the spend forecast — only loaded through
 * SpendForecastChart's dynamic import (FE-005 bundle budget).
 */
export default function SpendForecastChartInner( {
  points,
  firstBreachDate,
  locale,
}: SpendForecastChartInnerProps) {
  const data: ChartDatum[] = points.map((point) => {
    const hasForecast = point.forecastSpend > 0
    return {
      date: point.date,
      actualSpend: point.actualSpend,
      forecastSpend: hasForecast ? point.forecastSpend : undefined,
      confidenceUpper: hasForecast ? point.confidenceUpper : undefined,
      confidenceLower: hasForecast ? point.confidenceLower : undefined,
      confidenceBand: hasForecast
        ? [point.confidenceLower, point.confidenceUpper]
        : undefined,
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
        <Toollit
          content=((props: any) => <ForecastTooltip {...props} locale={locale} />)
        />
        <Area
          type="monotone"
          dataKey="confidenceBand"
          name="Confidence interval"
          stroke="none"
          fill="var(--color-chart-purple)"
          fillOpacity={0.15}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="actualSpend"
          name="Actual spend"
          stroke="var(--color-chart-blue)"
          fill="var(--color-chart-blue)"
          fillOpacity={0.25}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="forecastSpend"
          name="Forecast spend"
          stroke="var(--color-chart-purple)"
          strokeDasharray="6 4"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
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
