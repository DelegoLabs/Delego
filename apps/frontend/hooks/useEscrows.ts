"use client";

import { useState, useEffect } from "react";
import type { ApiResponse, Escrow } from "@delegolabs/types";
import { api } from "../lib/api";
import {
  FAMILY_CONFIG,
  isRecordStale,
  peekReadModel,
  writeReadModel,
} from "../lib/readModelCache";

/** Fetch user escrows from the API with last-known-good hydrate (#619). */
export function useEscrows() {
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const cached = await peekReadModel<Escrow[]>("escrows", "list");
      if (cancelled) return;
      if (cached && Array.isArray(cached.payload)) {
        setEscrows(cached.payload);
        setCachedAt(cached.cachedAt);
        setStale(isRecordStale(cached, Date.now()));
        setLoading(false);
      }

      try {
        const res: ApiResponse<Escrow[]> = await api.getEscrows();
        if (cancelled) return;
        if (res.data) {
          setEscrows(res.data);
          setStale(false);
          const record = await writeReadModel("escrows", "list", res.data);
          setCachedAt(record.cachedAt);
        }
        if (res.error) {
          setError(res.error.message);
          setStale(true);
        }
        setLoading(false);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to fetch escrows"
        );
        setStale(true);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    escrows,
    loading,
    error,
    stale,
    cachedAt,
    ttlMs: FAMILY_CONFIG.escrows.ttlMs,
  };
}
