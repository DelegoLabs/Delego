/**
 * Multi-faceted catalog filter state and utilities (#785).
 *
 * Keeps all filtering logic pure so it can be unit-tested without a DOM.
 */
import type { MerchantProduct } from "./merchantCatalog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogFilterState {
  /** Selected category names. Empty array = no category restriction. */
  categories: string[];
  /** Minimum price in stroops (inclusive). Undefined = no lower bound. */
  minPrice?: number;
  /** Maximum price in stroops (inclusive). Undefined = no upper bound. */
  maxPrice?: number;
  /** When true, only products with stockQuantity > 0 are shown. */
  inStockOnly: boolean;
  /** Minimum average rating 0–5 (inclusive). Undefined = no restriction. */
  minRating?: number;
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilterState = {
  categories: [],
  inStockOnly: false,
};

// ---------------------------------------------------------------------------
// Filter predicate
// ---------------------------------------------------------------------------

/**
 * Returns true when `product` passes every active filter in `filters`.
 * Handles `undefined` optional fields gracefully — a product with no
 * `category` is excluded only when the filter explicitly requests categories.
 * A product with no `rating` is excluded only when `minRating` is set.
 */
export function productMatchesFilters(
  product: MerchantProduct,
  filters: CatalogFilterState
): boolean {
  // Category filter
  if (filters.categories.length > 0) {
    if (
      !product.category ||
      !filters.categories.includes(product.category)
    ) {
      return false;
    }
  }

  // Price filters (operate on numeric stroops)
  const priceStroops = parsePriceStroops(product.priceStroops);
  if (filters.minPrice !== undefined && priceStroops < filters.minPrice) {
    return false;
  }
  if (filters.maxPrice !== undefined && priceStroops > filters.maxPrice) {
    return false;
  }

  // Stock filter
  if (filters.inStockOnly && product.stockQuantity <= 0) {
    return false;
  }

  // Rating filter
  if (filters.minRating !== undefined) {
    if (product.rating === undefined || product.rating < filters.minRating) {
      return false;
    }
  }

  return true;
}

/**
 * Applies `filters` to the full `products` array and returns the subset that
 * passes all active predicates.
 */
export function applyFilters(
  products: MerchantProduct[],
  filters: CatalogFilterState
): MerchantProduct[] {
  return products.filter((p) => productMatchesFilters(p, filters));
}

// ---------------------------------------------------------------------------
// Derived state helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when any filter is non-default (i.e. the user has narrowed the
 * catalog at least once), so UI can show a "Clear filters" affordance.
 */
export function hasActiveFilters(filters: CatalogFilterState): boolean {
  return (
    filters.categories.length > 0 ||
    filters.inStockOnly ||
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined ||
    filters.minRating !== undefined
  );
}

/**
 * Extracts the sorted unique categories from a product list.
 * Products without a `category` field are skipped.
 */
export function extractCategories(products: MerchantProduct[]): string[] {
  const set = new Set<string>();
  for (const p of products) {
    if (p.category) set.add(p.category);
  }
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// URL codec helpers — convert CatalogFilterState ↔ individual query params
// ---------------------------------------------------------------------------

/** Serialises `CatalogFilterState` into a plain record of query-param strings. */
export function encodeFiltersToParams(
  filters: CatalogFilterState
): Record<string, string> {
  const params: Record<string, string> = {};

  if (filters.categories.length > 0) {
    params["cat"] = filters.categories.join(",");
  }
  if (filters.minPrice !== undefined) {
    params["minPrice"] = String(filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    params["maxPrice"] = String(filters.maxPrice);
  }
  if (filters.inStockOnly) {
    params["inStock"] = "1";
  }
  if (filters.minRating !== undefined) {
    params["minRating"] = String(filters.minRating);
  }

  return params;
}

/**
 * Parses individual query-param strings back into a `CatalogFilterState`.
 * Invalid / unparseable values are silently ignored (fall back to defaults).
 */
export function decodeParamsToFilters(
  searchParams: URLSearchParams
): CatalogFilterState {
  const filters: CatalogFilterState = { ...DEFAULT_CATALOG_FILTERS };

  const cat = searchParams.get("cat");
  if (cat) {
    const parsed = cat
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsed.length > 0) filters.categories = parsed;
  }

  const minPrice = parseOptionalPositiveNumber(searchParams.get("minPrice"));
  if (minPrice !== undefined) filters.minPrice = minPrice;

  const maxPrice = parseOptionalPositiveNumber(searchParams.get("maxPrice"));
  if (maxPrice !== undefined) filters.maxPrice = maxPrice;

  if (searchParams.get("inStock") === "1") {
    filters.inStockOnly = true;
  }

  const minRating = parseOptionalRating(searchParams.get("minRating"));
  if (minRating !== undefined) filters.minRating = minRating;

  return filters;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function parsePriceStroops(priceStroops: string): number {
  const n = Number(priceStroops);
  return Number.isFinite(n) ? n : 0;
}

function parseOptionalPositiveNumber(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function parseOptionalRating(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 5) return undefined;
  return n;
}
