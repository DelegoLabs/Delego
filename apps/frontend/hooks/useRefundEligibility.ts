"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EligibilityReason } from "../lib/refund";
import { api } from "../lib/api";

export interface RefundEligibilityResult {
  eligible: boolean | null; // null = loading
  reason: EligibilityReason | null;
  loading: boolean;
  error: string | null;
  /** Re-query the contract getter. */
  refresh: () => Promise<void>;
}

/**
 * Queries the gateway (which proxies the escrow contract's read-only
 * `get_refund_eligibility` getter) for a given escrow ID and caller address.
 *
 * The hook is strictly read-only: it only ever calls GET endpoints and never
 * touches any mutation call site.
 */
export function useRefundEligibility(
  escrowId: string | null | undefined,
  callerAddress: string | null | undefined
): RefundEligibilityResult {
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [reason, setReason] = useState<EligibilityReason | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const query = useCallback(
    async (signal?: AbortSignal) => {
      if (!escrowId || !callerAddress) {
        setEligible(null);
        setReason(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        // GET /api/v1/escrows/:id/refund-eligibility?caller=<address>
        // This proxies the read-only contract getter — no state is mutated.
        const res = await (api as unknown as {
          getRefundEligibility: (
            escrowId: string,
            caller: string,
            opts?: { signal?: AbortSignal }
          ) => Promise<{
            data?: { eligible: boolean; reason: string };
            error?: { message: string };
          }>;
        }).getRefundEligibility(escrowId, callerAddress, { signal });

        if (signal?.aborted || !mountedRef.current) return;

        if (res.error) {
          setError(res.error.message);
        } else if (res.data) {
          setEligible(res.data.eligible);
          setReason(res.data.reason as EligibilityReason);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (mountedRef.current)
          setError("Failed to check refund eligibility");
      } finally {
        if (!signal?.aborted && mountedRef.current) setLoading(false);
      }
    },
    [escrowId, callerAddress]
  );

  const refresh = useCallback(() => query(), [query]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    query(controller.signal);
    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [query]);

  return { eligible, reason, loading, error, refresh };
}
