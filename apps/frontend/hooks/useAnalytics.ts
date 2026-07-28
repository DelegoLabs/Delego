"use client";

import { useState, useEffect } from "react";
import type { Delegation } from "@delego/types";
import { api } from "../lib/api";

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

  useEffect(() => {
    async function fetchDelegations() {
      try {
        const response = await api.getDelegations();
        if (response.data) {
          setDelegations(response.data);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch delegations"
        );
      } finally {
        setLoading(false);
      }
    }

    fetchDelegations();
  }, []);

  const overview: SpendingOverview = {
    totalDelegations: delegations.length,
    activeDelegations: delegations.filter((d) => d.status === "active").length,
    pausedDelegations: delegations.filter((d) => d.status === "paused").length,
    totalSpendingLimit: delegations.reduce(
      (sum, d) => sum + d.policy.maxTotal,
      0n
    ),
    averageSpendingLimit:
      delegations.length > 0
        ? delegations.reduce((sum, d) => sum + d.policy.maxTotal, 0n) /
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

  return { delegations, overview, loading, error };
}
