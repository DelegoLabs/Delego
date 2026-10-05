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
import type {
  SpendForecastPoint,
  ForecastHorizonDays,
} from "../../lib/spendForecast";
import { parseStroops, stroopsToXlm } from "../../lib/spendForecast";
import { formatXlm } from "../../lib/orders";

export interface SpendForecastChartInnerProps {
  points: SpendForecastPoint[];
  firstBreachDate: string | null;
  locale?: string;
  horizon?: ForecastHorizonDays;
}interface ChartDatum {
  date: string;
  historicalXlm?: number;
  projectedXlm?: number;
  confidenceUpperXlm?: number;
  confidenceLowerXlm?: number;
  budgetXlm?: number;
  historical: bigint | null;
  projected: bigint | null;
  confidenceUpper: bigint | null;
  confidenceLower: bigint | null;
  budget: bigint | null;
}

function toXlm(value: bigint | null): number | undefined {
  return value === null ? undefined : stroopsToXlm(value);
}

function normalizePoint(point: SpendForecastPoint): ChartDatum {
  const historical = parseStroops(point.historicalSpentStroops);
  const projected = parseStroops(point.projectedSpentStroops);
  const confidenceUpper = parseStroops(point.confidenceUpperStroops);
  const confidenceLower = parseStroops(point.confidenceLowerStroops);
  const budget = parseStroops(point.budgetLimitStroops);
  return {
    date: point.date,
    historicalXlm: toXlm(historical),
    projectedXlm: toXlm(projected),
    confidenceUpperXlm: toXlm(confidenceUpper),
    confidenceLowerXlm: toXlm(confidenceLower),
    budgetXlm: toXlm(budget),
    historical,
    projected,
    confidenceUpper,
    confidenceLower,
    budget,
  };
}

/**
 * The confidence interval is rendered as a banded area between the
 * upper and lower bounds. Recharts needs a single data key for the band,
 * so we compute the band height and offset the base to the lower bound.
 */
function toBandedDatum(datum: ChartDatum): ChartDatum & {
  confidenceBandXlm?: number;
  confidenceBaseXlm?: number;
} {
  if (datum.confidenceUpperXlm === undefined || datum.confidenceLowerXlm === undefined) {
    return datum;
  }
  return {
    ...datum,
    confidenceBandXlm: datum.confidenceUpperXlm - datum.confidenceLowerXlm,
    confidenceBaseXlm: datum.confidenceLowerXlm,
  };
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
      {datum.confidenceUpper !== null && datum.confidenceLower !== null && (
        <p className="spend-chart-tooltip-value">
          Confidence: {formatXlm(datum.confidenceLower, locale)} –{" "}
          {formatXlm(datum.confidenceUpper, locale)} XLM
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
  horizon = 30,
}: SpendForecastChartInnerProps) {
  const data = points.map(normalizePoint).map(toBandedDatum);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
        data-testid={`spend-forecast-chart-${horizon}`}
      >
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
          dataKey="confidenceBaseXlm"
          stackId="confidence"
          stroke="none"
          fill="transparent"
          fillOpacity={0}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="confidenceBandXlm"
          name="Confidence interval"
          stackId="confidence"
          stroke="none"
          fill="var(--color-chart-purple)"
          fillOpacity={0.15}
          connectNulls={false}
          isAnimationActive={false}
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
