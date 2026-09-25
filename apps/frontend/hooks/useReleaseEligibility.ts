"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchReleaseEligibility,
  invalidateEligibilityCache,
  type ReleaseEligibilityResult,
} from "../services/releaseEligibility";
import { useNetwork } from "./useNetwork";

export interface UseReleaseEligibilityResult {
  /** Null while loading (first fetch not yet complete). */
  eligibility: ReleaseEligibilityResult | null;
  loading: boolean;
  error: string | null;
  /** Force a cache-bypassing refetch — call after any escrow event. */
  refresh: () => void;
}

/**
 * Queries the escrow contract's `get_release_eligibility` getter before
 * enabling the release CTA (Issue 3).
 *
 * Request coalescing is handled in services/releaseEligibility.ts so
 * multiple mounted instances for the same escrow never issue duplicate
 * RPC calls. The TTL is 15 s; callers can trigger an immediate refetch
 * via `refresh()` after known events (release, dispute).
 *
 * @param escrowId          The escrow contract ID to query.
 * @param contractAddress   Configured escrow contract address; null disables the hook.
 */
export function useReleaseEligibility(
  escrowId: string | null | undefined,
  contractAddress: string | null | undefined
): UseReleaseEligibilityResult {
  const { network, networkId } = useNetwork();
  const [eligibility, setEligibility] =
    useState<ReleaseEligibilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(
    async (bypass: boolean) => {
      if (!escrowId || !contractAddress) {
        setEligibility(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await fetchReleaseEligibility(
          network,
          networkId,
          contractAddress,
          escrowId,
          bypass
        );
        if (!mountedRef.current) return;
        setEligibility(result);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(
          err instanceof Error ? err.message : "Failed to check release eligibility"
        );
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [network, networkId, escrowId, contractAddress]
  );

  useEffect(() => {
    mountedRef.current = true;
    load(false);
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const refresh = useCallback(() => {
    if (escrowId && contractAddress) {
      invalidateEligibilityCache(networkId, contractAddress, escrowId);
    }
    load(true);
  }, [networkId, escrowId, contractAddress, load]);

  return { eligibility, loading, error, refresh };
}
