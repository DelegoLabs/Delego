"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { unwrap } from "../lib/unwrap";

/** Cache this snapshot for 15s so re-renders/remounts don't hammer the RPC node */
const RELEASE_ELIGIBILITY_STALE_TIME_MS = 15_000;
/** No live escrow-event push exists yet, so poll as a practical stand-in — still bounded by staleTime above */
const RELEASE_ELIGIBILITY_POLL_INTERVAL_MS = 30_000;

export function releaseEligibilityQueryKey(escrowId: string, caller: string | undefined) {
  return ["release-eligibility", escrowId, caller] as const;
}

export function useReleaseEligibility(escrowId: string, caller: string | undefined) {
  return useQuery({
    queryKey: releaseEligibilityQueryKey(escrowId, caller),
    queryFn: () => api.getReleaseEligibility(escrowId, caller as string).then(unwrap),
    enabled: Boolean(escrowId && caller),
    staleTime: RELEASE_ELIGIBILITY_STALE_TIME_MS,
    refetchInterval: RELEASE_ELIGIBILITY_POLL_INTERVAL_MS,
  });
}

/** Call after any local action that changes this escrow's on-chain state (release/refund/dispute attempts) */
export function useInvalidateReleaseEligibility(escrowId: string, caller: string | undefined) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: releaseEligibilityQueryKey(escrowId, caller) });
}
