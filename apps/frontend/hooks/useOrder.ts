"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { unwrap } from "../lib/unwrap";

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.getOrder(orderId).then(unwrap),
    enabled: Boolean(orderId),
  });
}
