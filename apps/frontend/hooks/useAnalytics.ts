"use client";

import { useState, useEffect, useMemo } from "react";
import type { Delegation } from "@delegolabs/types";
import { api } from "../lib/api";
import {
  FAMILY_CONFIG,
  isRecordStale,
  peekReadModel,
  writeReadModel,
} from "../lib/readModelCache";

export interface SpendingOverview {
  totalDelegations: number;
  activeDelegations: number;
  pausedDelegations: number;
  totalSpendingLimit: bigint;
  averageSpendingLimit: bigint;
  delegationsByStatus: Record<string, number>;
}

export interface SpendForecastPoint {
  date: string;
  actualSpend: number;
  forecastSpend: number;
  confidenceUpper: number;
  confidenceLower: number;
}

export type ForecastHorizon = 30 | 60 | 90;

export const FORECAST_HORIZONS: ForecastHorizon[] = [30, 60, 90];

/**
 * Number of historical days used to derive the purchasing frequency.
 */
const HISTORY_WINDOW_DAYS = 30;

/**
 * z-score for a 95% confidence interval.
 */
const CONFIDENCE_Z = 1.96;

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Derive a daily spend series from delegations. The amount of a delegation is
 * amortized across the days it has been active, which gives a stable daily
 * spend estimate from the available delegation metadata.
 */
function buildDailySpendSeries(
  delegations: Delegation[],
  endDate: Date,
  windowDays: number
): Map<string, number> {
  const series = new Map<string, number>();
  const windowStart = addDays(endDate, -(windowDays - 1));
  windowStart.setHours(0, 0, 0, 0);

  for (const delegation of delegations) {
    const amount = Number(BigInt(delegation.policy.maxTotal));
    if (!Number.finite(amount) || amount <= 0) continue;

    const createdRaw = (delegation as { createdAt?: string | Date }).createdAt;
    const created = createdRaw ? new Date(createdRaw) : windowStart;
    if (Number.isNaN(created.getTime())) continue;

    const activeStart = created < windowStart ? windowStart : created;
    const activeDays = Math.max(
      1,
      Math.round(
        (endDate.getTime() - activeStart.getTime()) / (86400000)
      ) + 1
    );
    const dailyAmount = amount / activeDays;

    for (let day = 0; day < windowDays; day += 1) {
      const cursor = addDays(windowStart, day);
      if (cursor.getTime() < activeStart.getTime()) continue;
      const key = toDayKey(cursor);
      series.set(key, (series.get(key) ?? 0) + dailyAmount);
    }
  }

  return series;
}

/**
 * Linear regression over the historical series, used to project future daily spend.
 */
function linearRegression(values: number[]): { intercept: number; slope: number } {
  const n = values.length;
  if (n === 0) return { intercept: 0, slope: 0 };
  if (n === 1) return { intercept: values[0], slope: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denominator = n * sumXX - sumX * sumX;

  if (denominator === 0) {
    return { intercept: sumY / n, slope: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { intercept, slope };
}

/**
 * Standard deviation of the residuals around the regression line, used to
 * derive the confidence interval width.
 */
function residualStandardDeviation(
  values: number[],
  intercept: number,
  slope: number
): number {
  const n = values.length;
  if (n <= 2) return 0;
  let sumSquared = 0;
  for (let i = 0; i < n; i += 1) {
    const predicted = intercept + slope * i;
    const residual = values[i] - predicted;
    sumSquared += residual * residual;
  }
  return Math.sqrt(sumSquared / (n - 2));
}

/**
 * Build the predictive spend forecast series for a given horizon.
 */
export function buildSpendForecast(
  delegations: Delegation[],
  horizonDays: ForecastHorizon,
  now: Date = new Date()
): SpendForecastPoint[] {
  const endDate = new Date(now.getTime());
  endDate.setHours(0, 0, 0, 0);

  const history = buildDailySpendSeries(delegations, endDate, HISTORY_WINDOW_DAYS);
  const historyStart = addDays(endDate, -(HISTORY_WINDOW_DAYS - 1));

  const historicalValues: number[] = [];
  const historicalPoints: SpendForecastPoint[] = [];
  for (let day = 0; day < HISTORY_WINDOW_DAYS; day += 1) {
    const cursor = addDays(historyStart, day);
    const key = toDayKey(cursor);
    const actual = history.get(key) ?? 0;
    historicalValues.push(actual);
    historicalPoints.push({
      date: key,
      actualSpend: actual,
      forecastSpend: actual,
      confidenceUpper: actual,
      confidenceLower: actual,
    });
  }

  const { intercept, slope } = linearRegression(historicalValues);
  const sigma = residualStandardDeviation(historicalValues, intercept, slope);
  const lastIndex = HISTORY_WINDOW_DAYS - 1;

  const forecastPoints: SpendForecastPoint[] = [];
  for (let day = 1; day <= horizonDays; day += 1) {
    const cursor = addDays(endDate, day);
    const index = lastIndex + day;
    const projected = Math.max(0, intercept + slope * index);
    const margin = CONFIDENCE_Z * sigma;
    forecastPoints.push({
      date: toDayKey(cursor),
      actualSpend: 0,
      forecastSpend: projected,
      confidenceUpper: Math.max(0, projected + margin),
      confidenceLower: Math.max(0, projected - margin),
    });
  }

  return [...historicalPoints, ...forecastPoints];
}

export function useAnalytics() {
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [forecastHorizon, setForecastHorizon] = useState<ForecastHorizon>(30);

  useEffect(() => {
    let cancelled = false;
    async function fetchDelegations() {
      const cached = await peekReadModel<Delegation[]>("analytics", "delegations");
      if (cancelled) return;
      if (cached && Array.isArray(cached.payload)) {
        setDelegations(cached.payload);
        setCachedAt(cached.cachedAt);
        setStale(isRecordStale(cached, Date.now()));
        setLoading(false);
      }
      try {
        const response = await api.getDelegations();
        if (cancelled) return;
        if (response.data) {
          setDelegations(response.data);
          setStale(false);
          const record = await writeReadModel(
            "analytics",
            "delegations",
            response.data
          );
          setCachedAt(record.cachedAt);
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to fetch delegations"
        );
        setStale(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDelegations();
    return () => {
      cancelled = true;
    };
  }, []);

  const overview: SpendingOverview = {
    totalDelegations: delegations.length,
    activeDelegations: delegations.filter((d) => d.status === "active").length,
    pausedDelegations: delegations.filter((d) => d.status === "paused").length,
    totalSpendingLimit: delegations.reduce(
      (sum, d) => sum + BigInt(d.policy.maxTotal),
      0n
    ),
    averageSpendingLimit:
      delegations.length > 0
        ? delegations.reduce((sum, d) => sum + BigInt(d.policy.maxTotal), 0n() /
          BigInt(delegations.length)
        : 0n,
    delegationsByStatus: delegations.reduce(
      (acc, d) => {
        acc[d.status] = (acc[d.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
  };

  const spendForecast = useMemo(
    () => buildSpendForecast(delegations, forecastHorizon),
    [delegations, forecastHorizon]
  );

  return {
    delegations,
    overview,
    spendForecast,
    forecastHorizon,
    setForecastHorizon,
    loading,
    error,
    stale,
    cachedAt,
    ttlMs: FAMILY_CONFIG.analytics.ttlMs,
  };
}
