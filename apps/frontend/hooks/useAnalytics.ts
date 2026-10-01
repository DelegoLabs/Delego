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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

function toNumber(value: unknown, weight = 1): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return weight;
  }

function extractSpendAmount(delegation: Delegation): number {
  const candidates: unknown[] = [
    (delegation as { spentAmount?: unknown }).spentAmount,
    (delegation as { spent?: unknown }).spent,
    (delegation as { totalSpent?: unknown }).totalSpent,
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return toNumber(candidate, 0);
    }
  }
  return 0;
}

function extractTimestamp(delegation: Delegation): number {
  const candidates = [
    (delegation as { lastUpdated?: unknown }).lastUpdated,
    (delegation as { updatedAt?: unknown }).updatedAt,
    (delegation as { createdAt?: unknown }).createdAt,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate > 1000000000000 ? candidate : candidate * 1000;
    }
    if (typeof candidate === "string") {
      const parsed = Date.parse(candidate);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return Date.now();
}

function buildDailySpend(delegations: Delegation[]): Map<string, number> {
  const daily = new Map<string, number>();
  for (const delegation of delegations) {
    const amount = extractSpendAmount(delegation);
    if (amount <= 0) continue;
    const key = dayKey(new Date(extractTimestamp(delegation)));
    daily.set(key, (daily.get(key) ?? 0) + amount);
  }
  return daily;
}

function linearRegression(values: number[]): { slope: number; intercept: number; residualStdev: number } {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0, residualStdev: 0 };
  if (n === 1) return { slope: 0, intercept: values[0], residualStdev: 0 };
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) * (i - meanX);
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * i;
    sse += (values[i] - predicted) ** 2;
  }
  const residualStdev = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  return { slope, intercept, residualStdev };
}

function buildForecast(
  delegations: Delegation[],
  horizonDays: ForecastHorizon
): SpendForecastPoint[] {
  const daily = buildDailySpend(delegations);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const historyLength = Math.min(Math.max(horizonDays, 1), 90);
  const history: number[] = [];
  for (let i = historyLength - 1; i >= 0; i--) {
    const date = new Date(today.getTime() - i * MS_PER_DAY);
    history.push(daily.get(dayKey(date)) ?? 0);
  }
  const { slope, intercept, residualStdev } = linearRegression(history);
  const points: SpendForecastPoint[] = [];
  const total = historyLength + horizonDays;
  for (let i = 0; i < total; i++) {
    const date = new Date(today.getTime() - (historyLength - 1 - i) * MS_PER_DAY);
    const isHistorical = i < historyLength;
    const actual = isHistorical ? history[i] : 0;
    const projected = Math.max(0, intercept + slope * i);
    const horizonOffset = Math.max(0, i - (historyLength - 1));
    const uncertainty = residualStdev * Math.sqrt(1 + horizonOffset / Math.max(1, historyLength));
    const width = 1.96 * uncertainty;
    points.push({
      date: dayKey(date),
      actualSpend: actual,
      forecastSpend: projected,
      confidenceUpper: Math.max(0, projected + width),
      confidenceLower: Math.max(0, projected - width),
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
    () => buildForecast(delegations, horizonDays),
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
