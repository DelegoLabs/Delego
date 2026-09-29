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

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}/;

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayKeyToTime(key: string): number {
  return Date.parse(`${key}T00:00:00.000Z`);
}

function normalizeDayKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (DAY_PATTERN.test(value)) return value.slice(0, 10);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return toDayKey(new Date(parsed));
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.finite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.finite(parsed)) return parsed;
  }
  return 0;
}

export interface SpendTransaction {
  date?: string;
  timestamp?: number | string;
  amount?: number | bigint | string;
  spend?: number | bigint | string;
  value?: number | bigint | string;
  [key: string]: unknown;
}

export function extractSpendDate(tx: SpendTransaction): string | null {
  const candidates: unknown[] = [
    tx.date,
    tx.timestamp,
    tx.createdAt,
    tx.executedAt,
    tx.updatedAt,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.finite(candidate)) {
      const ms = candidate > 1e11 ? candidate : candidate * 1000;
      return toDayKey(new Date(ms));
    }
    const normalized = normalizeDayKey(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export function extractSpendAmount(tx: SpendTransaction): number {
  const candidates: unknown[] = [tx.amount, tx.spend, tx.value];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const num = toNumber(candidate);
    if (num !== 0) return num;
  }
  return 0;
}

export function buildDailySpendSeries(
  transactions: SpendTransaction[],
  endDate: Date = new Date(),
  days: number = 90
): { date: string; spend: number }[] {
  const buckets = new Map<string, number>();
  for (const tx of transactions) {
    const day = extractSpendDate(tx);
    if (!day) continue;
    const amount = extractSpendAmount(tx);
    buckets.set(day, (buckets.get(day) || 0) + amount);
  }

  const series: { date: string; spend: number }[] = [];
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(end.getTime() - i * MS_PER_DAY);
    const key = toDayKey(d);
    series.push({ date: key, spend: buckets.get(key) || 0 });
  }
  return series;
}

export function computeSpendForecast(
  transactions: SpendTransaction[],
  horizonDays: ForecastHorizon,
  endDate: Date = new Date(),
): SpendForecastPoint[] {
  const historyDays = Math.max(horizonDays, 30);
  const history = buildDailySpendSeries(transactions, endDate, historyDays);

  const nonzero = history.filter((p) => p.spend > 0);
  const activeDays = nonzero.length;
  const totalSpend = history.reduce((sum, p) => sum + p.spend, 0);
  const mean = history.length > 0 ? totalSpend / history.length : 0;
  const dailyRate = activeDays > 0 ? totalSpend / activeDays : mean;

  const variance =
    history.length > 1
      ? history.reduce((sum, p) => sum + (p.spend - mean) * (p.spend - mean), 0) /
        (history.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);
  const zed = 1.96;

  const lastDate = history.length > 0 ? history[history.length - 1].date : toDayKey(endDate);
  const lastTime = dayKeyToTime(lastDate);

  const points: SpendForecastPoint[] = history.map((p) => ({
    date: p.date,
    actualSpend: Number(p.spend.toFixed(2)),
    forecastSpend: 0,
    confidenceUpper: 0,
    confidenceLower: 0,
  }));

  for (let i = 1; i <= horizonDays; i += 1) {
    const date = toDayKey(new Date(lastTime + i * MS_PER_DAY));
    const projected = dailyRate * i;
    const interval = zed * stdDev * Math.sqrt(i);
    points.push({
      date,
      actualSpend: 0,
      forecastSpend: Number(projected.toFixed(2)),
      confidenceUpper: Number(Math.max(0, projected + interval).toFixed(2)),
      confidenceLower: Number(Math.max(0, projected - interval).toFixed(2)),
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
  const [transactions, setTransactions] = useState<SpendTransaction[]>([]);
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

  useEffect(() => {
    let cancelled = false;
    async function fetchTransactions() {
      const cached = await peekReadModel<SpendTransaction[]>(
        "analytics",
        "spendTransactions"
      );
      if (cancelled) return;
      if (cached && Array.isArray(cached.payload)) {
        setTransactions(cached.payload);
      }
      try {
        const response = await api.getSpendTransactions();
        if (cancelled) return;
        if (response.data) {
          setTransactions(response.data);
          await writeReadModel(
            "analytics",
            "spendTransactions",
            response.data
          );
        }
      } catch {
        // Transaction history is optional for the forecast; keep cached data.
      }
    }

    fetchTransactions();
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
    () => computeSpendForecast(transactions, horizonDays),
    [transactions, horizonDays]
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
