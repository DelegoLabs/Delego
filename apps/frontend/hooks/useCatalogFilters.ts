"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_CATALOG_FILTERS,
  decodeParamsToFilters,
  encodeFiltersToParams,
  type CatalogFilterState,
} from "../lib/catalogFilters";

/**
 * Manages `CatalogFilterState` and keeps it synchronised with the URL query
 * string via the Next.js App Router (`#785`).
 *
 * - Applying a filter updates the URL immediately (shallow push, no scroll).
 * - Reloading the page with filter params restores the filter state.
 * - Removing a filter removes its corresponding params from the URL.
 * - Multiple categories are encoded as a single comma-separated `cat` param.
 * - Invalid param values are silently ignored and fall back to defaults.
 *
 * URL codec lives in `lib/catalogFilters.ts` so it can be tested without React.
 */
export function useCatalogFilters(): {
  filters: CatalogFilterState;
  setFilters: (patch: Partial<CatalogFilterState>) => void;
  resetFilters: () => void;
  hydrated: boolean;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [hydrated, setHydrated] = useState(false);
  const [filters, setFiltersState] = useState<CatalogFilterState>(DEFAULT_CATALOG_FILTERS);

  // On mount (and whenever the URL search params change via back/forward), read
  // the current URL and hydrate local state. Runs client-side only to avoid
  // SSR hydration mismatches — mirrors the approach used in useQueryParamState.
  useEffect(() => {
    setFiltersState(decodeParamsToFilters(searchParams));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only react to searchParams changes
  }, [searchParams]);

  /** Push a partial filter update to state + URL. */
  const setFilters = useCallback(
    (patch: Partial<CatalogFilterState>) => {
      setFiltersState((prev) => {
        const next: CatalogFilterState = { ...prev, ...patch };

        // Rebuild the query string: start from the current params so unrelated
        // params (e.g. pagination) are preserved, then overlay the filter params.
        const params = new URLSearchParams(searchParams.toString());

        // Remove all existing filter keys first to avoid stale values.
        for (const key of ["cat", "minPrice", "maxPrice", "inStock", "minRating"]) {
          params.delete(key);
        }

        // Write the new filter values.
        const encoded = encodeFiltersToParams(next);
        for (const [key, value] of Object.entries(encoded)) {
          params.set(key, value);
        }

        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });

        return next;
      });
    },
    [pathname, router, searchParams]
  );

  /** Reset all filters and clear filter params from the URL. */
  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_CATALOG_FILTERS);

    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["cat", "minPrice", "maxPrice", "inStock", "minRating"]) {
      params.delete(key);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return { filters, setFilters, resetFilters, hydrated };
}
