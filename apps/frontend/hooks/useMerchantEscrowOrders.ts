"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMerchantEscrowOrders, type MerchantEscrowOrder } from "../lib/merchantEscrowOrders";

export interface UseMerchantEscrowOrdersResult {
  orders: MerchantEscrowOrder[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMerchantEscrowOrders(): UseMerchantEscrowOrdersResult {
  const [orders, setOrders] = useState<MerchantEscrowOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMerchantEscrowOrders();
      setOrders(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { orders, loading, error, refresh };
}
