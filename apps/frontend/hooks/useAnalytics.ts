"use client";

import { useState, useEffect } from "react";
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

export function useAnalytics() {
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

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

  return {
    delegations,
    overview,
    loading,
    error,
    stale,
    cachedAt,
    ttlMs: FAMILY_CONFIG.analytics.ttlMs,
  };
}
