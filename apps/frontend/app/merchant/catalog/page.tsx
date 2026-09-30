"use client";

import { useMemo, useState } from "react";
import { useMerchantCatalog } from "../../../hooks/useMerchantCatalog";
import { useCatalogFilters } from "../../../hooks/useCatalogFilters";
import {
  applyFilters,
  extractCategories,
  hasActiveFilters,
} from "../../../lib/catalogFilters";
import { CATALOG_PAGE_SIZE, priceDisplay } from "../../../lib/merchantCatalog";
import {
  CatalogFilterSidebar,
  MobileCatalogFilterDrawer,
} from "../../../components/filters/CatalogFilterSidebar";

export default function MerchantCatalogPage() {
  const [page, setPage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { products, total, loading, error, toggleListed } = useMerchantCatalog(page);
  const { filters, setFilters, resetFilters, hydrated } = useCatalogFilters();

  // Extract categories from the full (unfiltered) list so category options
  // remain stable while filters are active.
  const categories = useMemo(() => extractCategories(products), [products]);

  // Apply filters on the client side after the catalog page loads.
  const visibleProducts = useMemo(
    () => (hydrated ? applyFilters(products, filters) : products),
    [products, filters, hydrated]
  );

  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const filtersActive = hasActiveFilters(filters);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Catalog</h1>

        {/* Mobile "Filters" trigger — hidden on desktop via CSS */}
        <button
          type="button"
          className="catalog-filter-mobile-trigger"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open filter panel"
          aria-expanded={drawerOpen}
        >
          {/* Simple filter icon */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
            <path d="M1 3h14M4 8h8M7 13h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Filters
          {filtersActive && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "1.25rem",
                height: "1.25rem",
                padding: "0 0.25rem",
                borderRadius: "999px",
                background: "var(--color-accent)",
                color: "#fff",
                fontSize: "0.6875rem",
                fontWeight: 700,
                marginLeft: "0.125rem",
              }}
              aria-label={`${filters.categories.length + (filtersActive ? 1 : 0)} filters active`}
            >
              •
            </span>
          )}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem" }}>
          {error}
        </div>
      )}

      {/* Catalog layout: sidebar + products */}
      <div className="catalog-layout">
        {/* Desktop sidebar */}
        <CatalogFilterSidebar
          filters={filters}
          categories={categories}
          onChange={setFilters}
          onReset={resetFilters}
        />

        {/* Products */}
        <div className="catalog-products">
          {loading ? (
            <p style={{ color: "#6b7280" }}>Loading catalog…</p>
          ) : visibleProducts.length === 0 ? (
            <p style={{ color: "#6b7280" }}>
              {filtersActive
                ? "No products match the current filters."
                : "No products yet."}
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "0.875rem",
              }}
            >
              {visibleProducts.map((product) => (
                <div
                  key={product.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    padding: "0.875rem",
                    borderRadius: "0.75rem",
                    border: "1px solid #e5e7eb",
                    opacity: product.isListed ? 1 : 0.6,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{product.title}</span>
                  <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>SKU {product.sku}</span>
                  {product.category && (
                    <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                      {product.category}
                    </span>
                  )}
                  <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {priceDisplay(product)}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                    Stock: {product.stockQuantity}
                  </span>
                  {product.rating !== undefined && (
                    <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                      Rating: {product.rating.toFixed(1)}★
                    </span>
                  )}

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "0.75rem",
                      marginTop: "0.25rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      role="switch"
                      aria-checked={product.isListed}
                      checked={product.isListed}
                      onChange={() => void toggleListed(product.id)}
                    />
                    {product.isListed ? "Listed" : "Unlisted"}
                  </label>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem" }}>
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                style={{ padding: "0.375rem 0.75rem", borderRadius: "0.5rem", border: "1px solid #d1d5db", cursor: page === 0 ? "not-allowed" : "pointer" }}
              >
                Previous
              </button>
              <span style={{ fontSize: "0.8125rem", color: "#6b7280" }}>
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                style={{
                  padding: "0.375rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #d1d5db",
                  cursor: page + 1 >= totalPages ? "not-allowed" : "pointer",
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      <MobileCatalogFilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        categories={categories}
        onChange={setFilters}
        onReset={resetFilters}
      />
    </div>
  );
}
