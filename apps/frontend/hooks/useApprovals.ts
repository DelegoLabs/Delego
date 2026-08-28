"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApprovalStatus } from "@delego/types";
import { api } from "../lib/api";
import { unwrap } from "../lib/unwrap";

const APPROVALS_QUERY_KEY = ["approvals"] as const;

export function useApprovals() {
  return useQuery({
    queryKey: APPROVALS_QUERY_KEY,
    queryFn: () => api.listApprovals().then(unwrap),
  });
}

export function useBulkUpdateApprovals() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: Extract<ApprovalStatus, "approved" | "rejected"> }) =>
      api.bulkUpdateApprovals(ids, status).then(unwrap),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPROVALS_QUERY_KEY });
    },
  });
}
