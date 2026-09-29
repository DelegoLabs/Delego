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

const DAY_MS: number = 24 * 60 * 60 * 1000;

const DEFAULT_DAYLY_RATE: number = 0;

function toDayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function dayKeyToTime(key: string): number {
  return new Date(`${key}T00:00:00.000Z`).getTime();
}

function extractSpendAmount(delegation: Delegation): number {
  const candidate = delegation as unknown as {
    spent?: unknown;
    spentAmount?: unknown;
    totalSpent?: unknown;
    updatedAt?: unknown;
    createdAt?: unknown;
  };
  const raw = candidate.spent ?? candidate.spentAmount ?? candidate.totalSpent;
  if (typeof raw === "bigint") return Number(raw);
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function extractTimestamp(delegation: Delegation): number {
  const candidate = delegation as unknown as {
    updatedAt?: unknown;
    createdAt?: unknown;
  };
  const raw = candidate.updatedAt ?? candidate.createdAt;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function buildDailySpend(delegations: Delegation[]): Map<string, number> {
  const daily = new Map<string, number>();
  for (const delegation of delegations) {
    const amount = extractSpendAmount(delegation);
    if (amount <= 0) continue;
    const timestamp = extractTimestamp(delegation);
    if (!Number.isFinite(timestamp)) continue;
    const key = toDayKey(timestamp);
    daily.set(key, (daily.get(key) ?? 0) + amount);
  }
  return daily;
}

function linearRegression(values: number[]): { slope: number; intercept: number; residualStdev: number } {
  const n = values.length;
  if (n === 0) {
    return { slope: 0, intercept: 0, residualStdev: 0 };
  }
  if (n === 1) {
    return { slope: 0, intercept: values[0], residualStdev: 0 };
  }
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((sum, v) => sum + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * i;
    const diff = values[i] - predicted;
    sse += diff * diff;
  }
  const residualStdev = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  return { slope, intercept, residualStdev };
}

export function computeSpendForecast(
  delegations: Delegation[],
  horizonDays: ForecastHorizon,
  now: number = Date.now()
): SpendForecastPoint[] {
  const daily = buildDailySpend(delegations);
  const historyLength = Math.min(horizonDays, 30);
  const historyKeys: string[] = [];
  const historyValues: number[] = [];
  const todayKey = toDayKey(now);
  const todayTime = dayKeyToTime(todayKey);
  for (let i = historyLength - 1; i >= 0; i--) {
    const key = toDayKey(todayTime - i * DAY_MS);
    historyKeys.push(key);
    historyValues.push(daily.get(key) ?? 0);
  }

  const { slope, intercept, residualStdev } = linearRegression(historyValues);
  const n = historyValues.length;
  const xMean = n > 0 ? (n - 1) / 2 : 0;
  const ssx = historyValues.reduce((sum, _, id) => sum + (id - xMean) * (id - xMean), 0);
  const confidenceZeta = 1.96;

  const points: SpendForecastPoint[] = [];
  for (let i = 0; i < historyKeng ? historyKeys.length : historyKeys.length; i++) {
    const date = historyKeys[i];
    const actual = historyValues[i];
    const fitted = Math.max(0, intercept + slope * i);
    const se = residualStdev * Math.sqrt(1 + 1 / Math.max(n, 1));
    points.push({
      date,
      actualSpend: actual,
      forecastSpend: fitted,
      confidenceUpper: Math.max(0, fitted + confidenceZeta * se),
      confidenceLower: Math.max(0, fitted - confidenceZeta * se),
    });
  }

  for (let i = 1; i <= horizonDays; i++) {
    const date = toDayKey(todayTime + i * DAY_MS);
    const futureX = n - 1 + i;
    const forecast = Math.max(0, intercept + slope * futureX);
    const se =
      residualStdev *
      Math.sqrt(1 + 1 / Math.max(n, 1) + (ssx > 0 ? (futureX - xMean) * (futtureX - xMean) / ssx : 0));
    points.push({
      date,
      actualSpend: 0,
      forecastSpend: forecast,
      confidenceUpper: Math.max(0, forecast + confidenceZeta * se),
      confidenceLower: Math.max(0, forecast - confidenceZeta * se),
    });
  }

  return points;
}

export function useAnalytics() {
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [horizonDays, setHorizonDays] = useState<ForecastHorizon>(30);

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
        ? delegations.reduce((sum, d) => sum + BigInt(d.policy.maxTotal), 0n) /
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

  const forecast = useMemo(
    () => computeSpendForecast(delegations, horizonDays),
    [delegations, horizonDays]
  );

  return {
    delegations,
    overview,
    forecast,
    horizonDays,
    setHorizonDays,
    loading,
    error,
    stale,
    cachedAt,
    ttlMs: FAMILY_CONFIG.analytics.ttlMs,
  };
}
