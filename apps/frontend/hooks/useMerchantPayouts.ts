"use client";

import { useEffect, useState } from "react";
import { fetchMerchantPayouts, type PayoutRecord } from "../lib/merchantPayouts";

export function useMerchantPayouts() {
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMerchantPayouts()
      .then((result) => {
        if (!cancelled) setPayouts(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load payouts.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { payouts, loading, error };
}
