"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { unwrap } from "../lib/unwrap";

export function escrowDetailQueryKey(escrowId: string) {
  return ["escrow", escrowId] as const;
}

export function useEscrowDetail(escrowId: string) {
  return useQuery({
    queryKey: escrowDetailQueryKey(escrowId),
    queryFn: () => api.getEscrowDetail(escrowId).then(unwrap),
    enabled: Boolean(escrowId),
    staleTime: 15_000,
  });
}
