"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CATALOG_PAGE_SIZE,
  fetchMerchantCatalogPage,
  setProductListed,
  type MerchantProduct,
} from "../lib/merchantCatalog";

export function useMerchantCatalog(page: number) {
  const [products, setProducts] = useState<MerchantProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMerchantCatalogPage(page * CATALOG_PAGE_SIZE);
      setProducts(result.products);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Optimistically flips a product's `isListed` state, rolling back on failure. */
  const toggleListed = useCallback(async (productId: string) => {
    let previous: boolean | undefined;
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        previous = p.isListed;
        return { ...p, isListed: !p.isListed };
      })
    );
    try {
      const next = !previous;
      await setProductListed(productId, next);
    } catch (err) {
      // Roll back the optimistic update on failure.
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, isListed: previous ?? p.isListed } : p))
      );
      setError(err instanceof Error ? err.message : "Failed to update listing.");
    }
  }, []);

  return { products, total, loading, error, toggleListed, refresh: load };
}
