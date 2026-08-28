"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FAMILY_CONFIG,
  isRecordStale,
  peekReadModel,
  writeReadModel,
  type QueryFamily,
} from "../lib/readModelCache";

export interface UseReadModelResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  /** True when the visible data came from cache past its family TTL. */
  stale: boolean;
  cachedAt: number | null;
  ttlMs: number;
  revalidate: () => Promise<void>;
}

/**
 * Stale-while-revalidate wrapper around a query family (#619).
 *
 * 1. Serve last-known-good from the read-model cache (instant hydrate).
 * 2. Revalidate in the background.
 * 3. Reconcile: fresh payload replaces cache; a failed revalidate keeps
 *    the cached row and marks it stale.
 *
 * Semantics per family are documented on `FAMILY_CONFIG` (TTL + version).
 */
export function useReadModel<T>(options: {
  family: QueryFamily;
  key?: string;
  fetcher: (signal?: AbortSignal) => Promise<T>;
  enabled?: boolean;
}): UseReadModelResult<T> {
  const { family, key = "list", fetcher, enabled = true } = options;
  const ttlMs = FAMILY_CONFIG[family].ttlMs;
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const revalidate = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const fresh = await fetcherRef.current(signal);
        if (signal?.aborted) return;
        setData(fresh);
        setError(null);
        setStale(false);
        const record = await writeReadModel(family, key, fresh);
        setCachedAt(record.cachedAt);
      } catch (err) {
        if (signal?.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to revalidate");
        setStale(true);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [family, key]
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      const cached = await peekReadModel<T>(family, key);
      if (cancelled || controller.signal.aborted) return;
      if (cached) {
        setData(cached.payload);
        setCachedAt(cached.cachedAt);
        setStale(isRecordStale(cached, Date.now()));
        setLoading(false);
      }
      await revalidate(controller.signal);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, family, key, revalidate]);

  return {
    data,
    loading,
    error,
    stale,
    cachedAt,
    ttlMs,
    revalidate: () => revalidate(),
  };
}
