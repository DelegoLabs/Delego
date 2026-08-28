"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateOrderIssuePayload } from "@delego/types";
import { api } from "../lib/api";
import { unwrap } from "../lib/unwrap";

/** Submits a lightweight "report a problem" issue — never creates or touches a formal Dispute */
export function useReportOrderIssue(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateOrderIssuePayload) => api.createOrderIssue(orderId, payload).then(unwrap),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-issues", orderId] });
    },
  });
}
