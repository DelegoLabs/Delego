"use client";

import { useEffect, useMemo, useState } from "react";
import { useMerchantCatalog } from "../../../hooks/useMerchantCatalog";
import { useCatalogFilters } from "../../../hooks/useCatalogFilters";
import {
  InventoryThresholdField,
  LowStockBadge,
  LowStockBannerAlert,
} from "../../../components/merchant/InventoryAlerts";
import {
  applyFilters,
  extractCategories,
  hasActiveFilters,
} from "../../../lib/catalogFilters";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  computeDepletedProducts,
  readLowStockThreshold,
  subscribeLowStockThreshold,
} from "../../../lib/inventoryStock";
import { CATALOG_PAGE_SIZE, priceDisplay } from "../../../lib/merchantCatalog";
import {
  CatalogFilterSidebar,
  MobileCatalogFilterDrawer,
} from "../../../components/filters/CatalogFilterSidebar";
import { CatalogCsvImporter } from "../../../components/merchant/CatalogCsvImporter";
import { importMerchantCatalog } from "../../../lib/merchantRegistration";
import type { CatalogImportRow } from "../../../lib/catalogCsv";
import type { CsvImportRow } from "../../../lib/csvCatalogImport";
import { DuplicateProductModal } from "../../../components/DuplicateProductModal";
import {
  collectTakenSkus,
  type DuplicateProductDraft,
} from "../../../lib/productDuplicate";
import {
  catalogProductKey,
  loadCatalogVariants,
  saveCatalogVariants,
} from "../../../lib/variantMatrix";
import type { MerchantProduct } from "../../../lib/merchantCatalog";

/** Per-product "⋯" actions menu (#1012). */
function ProductRowMenu({
  product,
  onDuplicate,
}: {
  product: MerchantProduct;
  onDuplicate: (product: MerchantProduct) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = `product-actions-${product.id}`;

  return (
    <div
      style={{ position: "relative", alignSelf: "flex-end" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={`Actions for ${product.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        style={{
          border: "1px solid #d1d5db",
          borderRadius: "0.375rem",
          background: "#fff",
          padding: "0 0.5rem",
          cursor: "pointer",
          lineHeight: 1.5,
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            zIndex: 10,
            minWidth: 140,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "0.5rem",
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            padding: "0.25rem",
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDuplicate(product);
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              border: "none",
              background: "transparent",
              padding: "0.375rem 0.5rem",
              fontSize: "0.8125rem",
              cursor: "pointer",
            }}
          >
            Duplicate
          </button>
        </div>
      )}
    </div>
  );
}

export default function MerchantCatalogPage() {
  const [page, setPage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<MerchantProduct | null>(null);

  const { products, total, loading, error, toggleListed, refresh } = useMerchantCatalog(page);

  // Product and variant SKUs on this page. The server still has the final
  // say for SKUs on other pages — a collision there surfaces as a submit error.
  const takenSkus = useMemo(
    () =>
      collectTakenSkus(
        products,
        products.map((p) => loadCatalogVariants(catalogProductKey(p.title)))
      ),
    [products]
  );

  const handleDuplicate = async (draft: DuplicateProductDraft) => {
    await importMerchantCatalog([
      {
        sku: draft.sku,
        title: draft.title,
        priceStroops: draft.priceStroops,
        assetCode: draft.assetCode,
        stockQuantity: draft.stockQuantity,
        isListed: draft.isListed,
        ...(draft.category ? { category: draft.category } : {}),
        ...(draft.description ? { description: draft.description } : {}),
        ...(draft.imageUrl ? { imageUrl: draft.imageUrl } : {}),
      },
    ]);
    if (draft.variants) saveCatalogVariants(draft.variants);
    await refresh();
  };
  const { filters, setFilters, resetFilters, hydrated } = useCatalogFilters();
  const [threshold, setThreshold] = useState(DEFAULT_LOW_STOCK_THRESHOLD);

  useEffect(() => {
    setThreshold(readLowStockThreshold());
    return subscribeLowStockThreshold(setThreshold);
  }, []);

  const { depletedProductsCount, criticalItemTitles, hasOutOfStock, severity } =
    useMemo(() => computeDepletedProducts(products), [products]);

  const handleQuickRestock = () => {
    setFilters({ lowStockOnly: true });
  };

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
      <LowStockBannerAlert
        depletedProductsCount={depletedProductsCount}
        criticalItemTitles={criticalItemTitles}
        onQuickRestockClick={handleQuickRestock}
        hasOutOfStock={hasOutOfStock}
        severity={severity}
      />

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

      <InventoryThresholdField />

      <CatalogCsvImporter
        onImport={async (rows) => {
          const payload: CatalogImportRow[] = rows.map((row: CsvImportRow) => ({
            sku: row.sku.trim(),
            title: row.title.trim(),
            priceStroops: row.priceStroops.trim(),
            assetCode: "USDC",
            stockQuantity: row.stock,
          }));
          await importMerchantCatalog(payload);
        }}
        onImported={() => {
          void refresh();
        }}
      />

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
                  <ProductRowMenu product={product} onDuplicate={setDuplicateSource} />
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
                  <LowStockBadge stockQuantity={product.stockQuantity} threshold={threshold} />
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

      <DuplicateProductModal
        open={duplicateSource !== null}
        source={duplicateSource}
        existingSkus={takenSkus}
        sourceVariants={
          duplicateSource
            ? loadCatalogVariants(catalogProductKey(duplicateSource.title))
            : null
        }
        onClose={() => setDuplicateSource(null)}
        onSubmit={handleDuplicate}
      />
    </div>
  );
}
