"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { unwrap } from "../lib/unwrap";

export function useOrderIssues(orderId: string) {
  return useQuery({
    queryKey: ["order-issues", orderId],
    queryFn: () => api.listOrderIssues(orderId).then(unwrap),
    enabled: Boolean(orderId),
  });
}
