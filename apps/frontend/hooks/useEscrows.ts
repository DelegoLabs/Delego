"use client";

import { useState, useEffect } from "react";
import type { ApiResponse, Escrow } from "@delego/types";
import { api } from "../lib/api";

/** Fetch user escrows from the API */
export function useEscrows() {
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .getEscrows()
      .then((res: ApiResponse<Escrow[]>) => {
        if (cancelled) return;
        if (res.data) setEscrows(res.data);
        if (res.error) setError(res.error.message);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to fetch escrows");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { escrows, loading, error };
}
