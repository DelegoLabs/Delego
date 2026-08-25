"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefundEligibility } from "@delego/types";
import { api } from "../lib/api";

export interface UseRefundEligibilityResult {
  eligibility: RefundEligibility | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Reads refund eligibility for `escrowId` from the on-chain
 * `get_refund_eligibility` getter (via the gateway -> payments service),
 * checked for `caller`. Returns null (not loading, no error) when either
 * id is missing, since there is nothing to check yet.
 */
export function useRefundEligibility(
  escrowId: string | null | undefined,
  caller: string | null | undefined
): UseRefundEligibilityResult {
  const [eligibility, setEligibility] = useState<RefundEligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!escrowId || !caller) {
        setEligibility(null);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await api.getRefundEligibility(escrowId, caller, { signal });
        if (signal?.aborted || !mountedRef.current) return;
        if (res.error) {
          setError(res.error.message);
        } else if (res.data) {
          setEligibility(res.data);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (mountedRef.current) setError("Failed to check refund eligibility");
      } finally {
        if (!signal?.aborted && mountedRef.current) setLoading(false);
      }
    },
    [escrowId, caller]
  );

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    load(controller.signal);
    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [load]);

  const refresh = useCallback(() => load(), [load]);

  return { eligibility, loading, error, refresh };
}
