"use client";

import dynamic from "next/dynamic";
import { Badge } from "@delegolabs/ui";
import type { SpendForecastPoint } from "../../lib/spendForecast";
import {
  isEmptyForecast,
  summarizeSpendForecast,
} from "../../lib/spendForecast";
import { formatXlm } from "../../lib/orders";
import { useDataSaver } from "../../hooks/useDataSaver";

export interface SpendForecastChartProps {
  points: SpendForecastPoint[];
  locale?: string;
}

/** Same lazy-loading strategy as SpendChart: recharts stays out of the initial bundle. */
const SpendForecastChartInner = dynamic(
  () => import("./SpendForecastChartInner"),
  {
    ssr: false,
    loading: () => <div className="spend-chart-skeleton" aria-hidden="true" />,
  }
);

/**
 * Actual vs forecasted spend for the current month (#721). The projected
 * trajectory renders as a dashed series, and a warning badge appears when
 * the projection crosses the monthly budget limit.
 */
export function SpendForecastChart({ points, locale }: SpendForecastChartProps) {
  const { reducedModeActive } = useDataSaver();

  if (isEmptyForecast(points)) {
    return (
      <div className="spend-chart-empty">
        <p>Not enough spending history to forecast this month.</p>
      </div>
    );
  }

  const summary = summarizeSpendForecast(points);

  return (
    <div className="spend-forecast">
      <div className="spend-forecast-header">
        <div className="spend-chart-summary-stat">
          <span className="spend-chart-summary-label">Projected month-end</span>
          <strong>
            {summary.projectedEndStroops !== null
              ? `${formatXlm(summary.projectedEndStroops, locale)} XLM`
              : "—"}
          </strong>
        </div>
        <div className="spend-chart-summary-stat">
          <span className="spend-chart-summary-label">Monthly limit</span>
          <strong>{formatXlm(summary.budgetLimitStroops, locale)} XLM</strong>
        </div>
        {summary.projectedBreach && (
          <Badge tone="error" role="alert" data-testid="spend-forecast-breach">
            Projected to exceed limit
            {summary.firstBreachDate ? ` by ${summary.firstBreachDate}` : ""}
          </Badge>
        )}
      </div>

      {reducedModeActive ? (
        <div className="spend-chart-summary" data-testid="spend-forecast-summary">
          <div className="spend-chart-summary-stat">
            <span className="spend-chart-summary-label">Spent to date</span>
            <strong>
              {summary.spentToDateStroops !== null
                ? `${formatXlm(summary.spentToDateStroops, locale)} XLM`
                : "—"}
            </strong>
          </div>
        </div>
      ) : (
        <SpendForecastChartInner
          points={points}
          firstBreachDate={summary.firstBreachDate}
          locale={locale}
        />
      )}
    </div>
  );
}
