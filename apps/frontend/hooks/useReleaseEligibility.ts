"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReleaseEligibility, ReleaseEligibilityCondition } from "@delego/types";
import { api } from "../../lib/api";

const DEFAULT_TTL_MS = 15_000;

interface CacheEntry {
  data: ReleaseEligibility;
  expiresAt: number;
}

const eligibilityCache = new Map<string, CacheEntry>();

function cacheKey(escrowId: string, callerAddress: string): string {
  return `${escrowId}:${callerAddress}`;
}

export function getCachedReleaseEligibility(
  escrowId: string,
  callerAddress: string
): ReleaseEligibility | null {
  const entry = eligibilityCache.get(cacheKey(escrowId, callerAddress));
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    eligibilityCache.delete(cacheKey(escrowId, callerAddress));
    return null;
  }
  return entry.data;
}

export function setCachedReleaseEligibility(
  escrowId: string,
  callerAddress: string,
  data: ReleaseEligibility,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  eligibilityCache.set(cacheKey(escrowId, callerAddress), {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export function invalidateReleaseEligibilityCache(escrowId: string): void {
  for (const key of Array.from(eligibilityCache.keys())) {
    if (key.startsWith(`${escrowId}:`)) {
      eligibilityCache.delete(key);
    }
  }
}

export interface UseReleaseEligibilityOptions {
  escrowId: string | null;
  callerAddress: string | null;
  ttlMs?: number;
  refetchOn?: unknown[];
}

export interface UseReleaseEligibilityResult {
  eligibility: ReleaseEligibility | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  unmetConditions: ReleaseEligibilityCondition[];
}

export function useReleaseEligibility({
  escrowId,
  callerAddress,
  ttlMs = DEFAULT_TTL_MS,
  refetchOn = [],
}: UseReleaseEligibilityOptions): UseReleaseEligibilityResult {
  const [eligibility, setEligibility] = useState<ReleaseEligibility | null>(() =>
    escrowId && callerAddress
      ? getCachedReleaseEligibility(escrowId, callerAddress)
      : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);

  const fetchEligibility = useCallback(async () => {
    if (!escrowId || !callerAddress) return;

    const cached = getCachedReleaseEligibility(escrowId, callerAddress);
    if (cached) {
      setEligibility(cached);
      return;
    }

    if (inflightRef.current) {
      await inflightRef.current;
      return;
    }

    setLoading(true);
    setError(null);

    const promise = (async () => {
      try {
        const res = await api.getReleaseEligibility(escrowId, callerAddress);
        if (res.error) {
          throw new Error(res.error.message);
        }
        if (!res.data) {
          throw new Error("No eligibility data returned");
        }
        setCachedReleaseEligibility(escrowId, callerAddress, res.data, ttlMs);
        setEligibility(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to check eligibility");
      } finally {
        setLoading(false);
        inflightRef.current = null;
      }
    })();

    inflightRef.current = promise;
    await promise;
  }, [escrowId, callerAddress, ttlMs]);

  useEffect(() => {
    void fetchEligibility();
  }, [fetchEligibility, ...refetchOn]);

  const unmetConditions =
    eligibility?.conditions.filter((c) => !c.met) ?? [];

  return {
    eligibility,
    loading,
    error,
    refetch: fetchEligibility,
    unmetConditions,
  };
}
