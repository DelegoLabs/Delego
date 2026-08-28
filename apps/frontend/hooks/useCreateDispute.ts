"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateDisputePayload } from "@delego/types";
import { api } from "../lib/api";
import { unwrap } from "../lib/unwrap";

/** Creates a formal Dispute, optionally linked back to an escalated OrderIssue via `issueId` */
export function useCreateDispute(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDisputePayload) => api.createDispute(orderId, payload).then(unwrap),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-issues", orderId] });
    },
  });
}
