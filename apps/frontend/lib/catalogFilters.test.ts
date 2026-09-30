import { describe, it, expect } from "vitest";
import {
  DEFAULT_CATALOG_FILTERS,
  applyFilters,
  decodeParamsToFilters,
  encodeFiltersToParams,
  extractCategories,
  hasActiveFilters,
  productMatchesFilters,
  type CatalogFilterState,
} from "./catalogFilters";
import type { MerchantProduct } from "./merchantCatalog";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProduct(overrides: Partial<MerchantProduct> = {}): MerchantProduct {
  return {
    id: "p1",
    sku: "SKU-001",
    title: "Widget",
    priceStroops: "10000000", // 1 unit
    assetCode: "USDC",
    stockQuantity: 10,
    isListed: true,
    updatedAt: "2026-01-01T00:00:00Z",
    category: "Electronics",
    rating: 4,
    ...overrides,
  };
}

const PRODUCTS: MerchantProduct[] = [
  makeProduct({ id: "p1", title: "Widget A", category: "Electronics", rating: 4, priceStroops: "10000000", stockQuantity: 5 }),
  makeProduct({ id: "p2", title: "Widget B", category: "Clothing", rating: 3, priceStroops: "20000000", stockQuantity: 0 }),
  makeProduct({ id: "p3", title: "Gadget", category: "Electronics", rating: 5, priceStroops: "50000000", stockQuantity: 2 }),
  makeProduct({ id: "p4", title: "Shirt", category: "Clothing", rating: 2, priceStroops: "5000000", stockQuantity: 8 }),
  makeProduct({ id: "p5", title: "No Cat", category: undefined, rating: undefined, priceStroops: "1000000", stockQuantity: 1 }),
];

// ---------------------------------------------------------------------------
// DEFAULT_CATALOG_FILTERS
// ---------------------------------------------------------------------------

describe("DEFAULT_CATALOG_FILTERS", () => {
  it("has empty categories and inStockOnly=false", () => {
    expect(DEFAULT_CATALOG_FILTERS.categories).toEqual([]);
    expect(DEFAULT_CATALOG_FILTERS.inStockOnly).toBe(false);
    expect(DEFAULT_CATALOG_FILTERS.minPrice).toBeUndefined();
    expect(DEFAULT_CATALOG_FILTERS.maxPrice).toBeUndefined();
    expect(DEFAULT_CATALOG_FILTERS.minRating).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// productMatchesFilters — individual predicates
// ---------------------------------------------------------------------------

describe("productMatchesFilters", () => {
  const noFilter: CatalogFilterState = { ...DEFAULT_CATALOG_FILTERS };

  it("passes all products when no filters are active", () => {
    for (const p of PRODUCTS) {
      expect(productMatchesFilters(p, noFilter)).toBe(true);
    }
  });

  describe("category filter", () => {
    it("includes products whose category is selected", () => {
      const f: CatalogFilterState = { ...noFilter, categories: ["Electronics"] };
      expect(productMatchesFilters(PRODUCTS[0], f)).toBe(true); // Electronics
      expect(productMatchesFilters(PRODUCTS[2], f)).toBe(true); // Electronics
    });

    it("excludes products in a different category", () => {
      const f: CatalogFilterState = { ...noFilter, categories: ["Electronics"] };
      expect(productMatchesFilters(PRODUCTS[1], f)).toBe(false); // Clothing
      expect(productMatchesFilters(PRODUCTS[3], f)).toBe(false); // Clothing
    });

    it("excludes products with no category when category filter is active", () => {
      const f: CatalogFilterState = { ...noFilter, categories: ["Electronics"] };
      expect(productMatchesFilters(PRODUCTS[4], f)).toBe(false); // no category
    });

    it("supports multiple categories simultaneously", () => {
      const f: CatalogFilterState = { ...noFilter, categories: ["Electronics", "Clothing"] };
      expect(productMatchesFilters(PRODUCTS[0], f)).toBe(true);
      expect(productMatchesFilters(PRODUCTS[1], f)).toBe(true);
      expect(productMatchesFilters(PRODUCTS[2], f)).toBe(true);
      expect(productMatchesFilters(PRODUCTS[3], f)).toBe(true);
    });
  });

  describe("price filter", () => {
    it("filters by minimum price (inclusive)", () => {
      const f: CatalogFilterState = { ...noFilter, minPrice: 20000000 };
      expect(productMatchesFilters(PRODUCTS[1], f)).toBe(true);  // 20M
      expect(productMatchesFilters(PRODUCTS[2], f)).toBe(true);  // 50M
      expect(productMatchesFilters(PRODUCTS[0], f)).toBe(false); // 10M
    });

    it("filters by maximum price (inclusive)", () => {
      const f: CatalogFilterState = { ...noFilter, maxPrice: 10000000 };
      expect(productMatchesFilters(PRODUCTS[0], f)).toBe(true);  // 10M
      expect(productMatchesFilters(PRODUCTS[4], f)).toBe(true);  // 1M
      expect(productMatchesFilters(PRODUCTS[1], f)).toBe(false); // 20M
    });

    it("minPrice and maxPrice work independently", () => {
      const min: CatalogFilterState = { ...noFilter, minPrice: 10000000 };
      const max: CatalogFilterState = { ...noFilter, maxPrice: 20000000 };
      // min only
      expect(productMatchesFilters(PRODUCTS[0], min)).toBe(true);
      expect(productMatchesFilters(PRODUCTS[4], min)).toBe(false);
      // max only
      expect(productMatchesFilters(PRODUCTS[2], max)).toBe(false);
      expect(productMatchesFilters(PRODUCTS[1], max)).toBe(true);
    });

    it("filters by both min and max price simultaneously", () => {
      const f: CatalogFilterState = { ...noFilter, minPrice: 5000000, maxPrice: 20000000 };
      expect(productMatchesFilters(PRODUCTS[4], f)).toBe(false); // 1M — below min
      expect(productMatchesFilters(PRODUCTS[3], f)).toBe(true);  // 5M — at min
      expect(productMatchesFilters(PRODUCTS[1], f)).toBe(true);  // 20M — at max
      expect(productMatchesFilters(PRODUCTS[2], f)).toBe(false); // 50M — above max
    });
  });

  describe("rating filter", () => {
    it("filters by minimum rating", () => {
      const f: CatalogFilterState = { ...noFilter, minRating: 4 };
      expect(productMatchesFilters(PRODUCTS[0], f)).toBe(true);  // rating 4
      expect(productMatchesFilters(PRODUCTS[2], f)).toBe(true);  // rating 5
      expect(productMatchesFilters(PRODUCTS[1], f)).toBe(false); // rating 3
      expect(productMatchesFilters(PRODUCTS[3], f)).toBe(false); // rating 2
    });

    it("excludes products with no rating when minRating is set", () => {
      const p = makeProduct({ rating: undefined });
      const f: CatalogFilterState = { ...noFilter, minRating: 1 };
      expect(productMatchesFilters(p, f)).toBe(false);
    });

    it("does not filter by rating when minRating is undefined", () => {
      const p = makeProduct({ rating: undefined });
      expect(productMatchesFilters(p, noFilter)).toBe(true);
    });
  });

  describe("inStockOnly filter", () => {
    it("excludes out-of-stock products when enabled", () => {
      const f: CatalogFilterState = { ...noFilter, inStockOnly: true };
      expect(productMatchesFilters(PRODUCTS[1], f)).toBe(false); // stock 0
      expect(productMatchesFilters(PRODUCTS[0], f)).toBe(true);  // stock 5
    });

    it("includes out-of-stock products when disabled", () => {
      expect(productMatchesFilters(PRODUCTS[1], noFilter)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Combined filters
  // ---------------------------------------------------------------------------

  describe("combined filters", () => {
    it("category + price", () => {
      const f: CatalogFilterState = {
        ...noFilter,
        categories: ["Electronics"],
        maxPrice: 15000000,
      };
      expect(productMatchesFilters(PRODUCTS[0], f)).toBe(true);  // Electronics 10M
      expect(productMatchesFilters(PRODUCTS[2], f)).toBe(false); // Electronics 50M — price too high
      expect(productMatchesFilters(PRODUCTS[1], f)).toBe(false); // Clothing — wrong category
    });

    it("category + rating", () => {
      const f: CatalogFilterState = {
        ...noFilter,
        categories: ["Electronics"],
        minRating: 5,
      };
      expect(productMatchesFilters(PRODUCTS[0], f)).toBe(false); // Electronics rating 4
      expect(productMatchesFilters(PRODUCTS[2], f)).toBe(true);  // Electronics rating 5
    });

    it("price + stock", () => {
      const f: CatalogFilterState = {
        ...noFilter,
        maxPrice: 20000000,
        inStockOnly: true,
      };
      expect(productMatchesFilters(PRODUCTS[1], f)).toBe(false); // 20M stock=0
      expect(productMatchesFilters(PRODUCTS[0], f)).toBe(true);  // 10M stock=5
      expect(productMatchesFilters(PRODUCTS[2], f)).toBe(false); // 50M — price too high
    });

    it("category + price + rating + stock", () => {
      const f: CatalogFilterState = {
        categories: ["Electronics"],
        minPrice: 5000000,
        maxPrice: 30000000,
        minRating: 4,
        inStockOnly: true,
      };
      // p1: Electronics, 10M, rating 4, stock 5 → PASS
      expect(productMatchesFilters(PRODUCTS[0], f)).toBe(true);
      // p3: Electronics, 50M, rating 5, stock 2 → FAIL (price > max)
      expect(productMatchesFilters(PRODUCTS[2], f)).toBe(false);
      // p2: Clothing, 20M, rating 3, stock 0 → FAIL (category, rating, stock)
      expect(productMatchesFilters(PRODUCTS[1], f)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// applyFilters
// ---------------------------------------------------------------------------

describe("applyFilters", () => {
  it("returns all products when no filters are active", () => {
    expect(applyFilters(PRODUCTS, DEFAULT_CATALOG_FILTERS)).toHaveLength(PRODUCTS.length);
  });

  it("returns empty array when nothing matches", () => {
    const f: CatalogFilterState = { ...DEFAULT_CATALOG_FILTERS, categories: ["NonExistent"] };
    expect(applyFilters(PRODUCTS, f)).toHaveLength(0);
  });

  it("filters by single category", () => {
    const f: CatalogFilterState = { ...DEFAULT_CATALOG_FILTERS, categories: ["Electronics"] };
    const result = applyFilters(PRODUCTS, f);
    expect(result.map((p) => p.id)).toEqual(["p1", "p3"]);
  });

  it("filters in-stock only", () => {
    const f: CatalogFilterState = { ...DEFAULT_CATALOG_FILTERS, inStockOnly: true };
    const result = applyFilters(PRODUCTS, f);
    expect(result.every((p) => p.stockQuantity > 0)).toBe(true);
    expect(result.find((p) => p.id === "p2")).toBeUndefined(); // stock 0
  });
});

// ---------------------------------------------------------------------------
// hasActiveFilters
// ---------------------------------------------------------------------------

describe("hasActiveFilters", () => {
  it("returns false for default state", () => {
    expect(hasActiveFilters(DEFAULT_CATALOG_FILTERS)).toBe(false);
  });

  it("returns true when any filter is non-default", () => {
    expect(hasActiveFilters({ ...DEFAULT_CATALOG_FILTERS, categories: ["X"] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_CATALOG_FILTERS, inStockOnly: true })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_CATALOG_FILTERS, minPrice: 0 })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_CATALOG_FILTERS, maxPrice: 999 })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_CATALOG_FILTERS, minRating: 3 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractCategories
// ---------------------------------------------------------------------------

describe("extractCategories", () => {
  it("returns sorted unique categories", () => {
    expect(extractCategories(PRODUCTS)).toEqual(["Clothing", "Electronics"]);
  });

  it("skips products without a category", () => {
    const result = extractCategories([makeProduct({ category: undefined })]);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// encodeFiltersToParams / decodeParamsToFilters (URL sync)
// ---------------------------------------------------------------------------

describe("encodeFiltersToParams", () => {
  it("returns empty object for default filters", () => {
    expect(encodeFiltersToParams(DEFAULT_CATALOG_FILTERS)).toEqual({});
  });

  it("encodes categories as comma-separated cat param", () => {
    const f: CatalogFilterState = { ...DEFAULT_CATALOG_FILTERS, categories: ["Electronics", "Clothing"] };
    expect(encodeFiltersToParams(f)).toMatchObject({ cat: "Electronics,Clothing" });
  });

  it("encodes minPrice and maxPrice as strings", () => {
    const f: CatalogFilterState = { ...DEFAULT_CATALOG_FILTERS, minPrice: 100, maxPrice: 500 };
    expect(encodeFiltersToParams(f)).toMatchObject({ minPrice: "100", maxPrice: "500" });
  });

  it("encodes inStockOnly as '1' and omits it when false", () => {
    expect(encodeFiltersToParams({ ...DEFAULT_CATALOG_FILTERS, inStockOnly: true })).toMatchObject({ inStock: "1" });
    expect(encodeFiltersToParams({ ...DEFAULT_CATALOG_FILTERS, inStockOnly: false })).not.toHaveProperty("inStock");
  });

  it("encodes minRating as a string", () => {
    const f: CatalogFilterState = { ...DEFAULT_CATALOG_FILTERS, minRating: 4 };
    expect(encodeFiltersToParams(f)).toMatchObject({ minRating: "4" });
  });

  it("omits optional values when undefined", () => {
    const encoded = encodeFiltersToParams(DEFAULT_CATALOG_FILTERS);
    expect(encoded).not.toHaveProperty("minPrice");
    expect(encoded).not.toHaveProperty("maxPrice");
    expect(encoded).not.toHaveProperty("minRating");
  });
});

describe("decodeParamsToFilters", () => {
  function params(obj: Record<string, string>): URLSearchParams {
    return new URLSearchParams(obj);
  }

  it("returns default filters for empty params", () => {
    expect(decodeParamsToFilters(params({}))).toEqual(DEFAULT_CATALOG_FILTERS);
  });

  it("decodes multiple categories from comma-separated cat param", () => {
    const result = decodeParamsToFilters(params({ cat: "Electronics,Clothing" }));
    expect(result.categories).toEqual(["Electronics", "Clothing"]);
  });

  it("decodes a single category", () => {
    const result = decodeParamsToFilters(params({ cat: "Electronics" }));
    expect(result.categories).toEqual(["Electronics"]);
  });

  it("decodes minPrice and maxPrice", () => {
    const result = decodeParamsToFilters(params({ minPrice: "100", maxPrice: "500" }));
    expect(result.minPrice).toBe(100);
    expect(result.maxPrice).toBe(500);
  });

  it("decodes inStockOnly from inStock=1", () => {
    const result = decodeParamsToFilters(params({ inStock: "1" }));
    expect(result.inStockOnly).toBe(true);
  });

  it("does not set inStockOnly for inStock=0", () => {
    const result = decodeParamsToFilters(params({ inStock: "0" }));
    expect(result.inStockOnly).toBe(false);
  });

  it("decodes minRating", () => {
    const result = decodeParamsToFilters(params({ minRating: "4" }));
    expect(result.minRating).toBe(4);
  });

  it("ignores invalid minPrice / maxPrice values", () => {
    const result = decodeParamsToFilters(params({ minPrice: "not-a-number", maxPrice: "-10" }));
    // -10 is negative → invalid
    expect(result.minPrice).toBeUndefined();
    expect(result.maxPrice).toBeUndefined();
  });

  it("ignores minRating outside 0–5", () => {
    expect(decodeParamsToFilters(params({ minRating: "6" })).minRating).toBeUndefined();
    expect(decodeParamsToFilters(params({ minRating: "-1" })).minRating).toBeUndefined();
    expect(decodeParamsToFilters(params({ minRating: "abc" })).minRating).toBeUndefined();
  });

  it("handles empty cat param gracefully", () => {
    const result = decodeParamsToFilters(params({ cat: "" }));
    expect(result.categories).toEqual([]);
  });

  it("does not crash on completely invalid params", () => {
    expect(() =>
      decodeParamsToFilters(params({ cat: ",,,,", minPrice: "NaN", maxPrice: "Infinity", minRating: "xyz", inStock: "yes" }))
    ).not.toThrow();
  });

  // URL encode → decode round-trip
  it("round-trips all filter fields through encode/decode", () => {
    const original: CatalogFilterState = {
      categories: ["Electronics", "Clothing"],
      minPrice: 100,
      maxPrice: 5000,
      inStockOnly: true,
      minRating: 3,
    };
    const encoded = encodeFiltersToParams(original);
    const decoded = decodeParamsToFilters(new URLSearchParams(encoded));
    expect(decoded).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// Removing / clearing filters
// ---------------------------------------------------------------------------

describe("clearing filters", () => {
  it("resetting to DEFAULT_CATALOG_FILTERS restores the unfiltered catalog", () => {
    const filtered = applyFilters(PRODUCTS, {
      categories: ["Electronics"],
      inStockOnly: true,
      minRating: 5,
    });
    // Some products are filtered out
    expect(filtered.length).toBeLessThan(PRODUCTS.length);

    // After resetting, all products show
    const all = applyFilters(PRODUCTS, DEFAULT_CATALOG_FILTERS);
    expect(all).toHaveLength(PRODUCTS.length);
  });

  it("encodes cleared filters as empty params (no leftover keys)", () => {
    const encoded = encodeFiltersToParams(DEFAULT_CATALOG_FILTERS);
    expect(Object.keys(encoded)).toHaveLength(0);
  });
});
