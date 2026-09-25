"use client";

import { useState } from "react";
import { useMerchantCatalog } from "../../../hooks/useMerchantCatalog";
import { CATALOG_PAGE_SIZE, priceDisplay } from "../../../lib/merchantCatalog";

export default function MerchantCatalogPage() {
  const [page, setPage] = useState(0);
  const { products, total, loading, error, toggleListed } = useMerchantCatalog(page);
  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h1>Catalog</h1>

      {error && (
        <div role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#6b7280" }}>Loading catalog…</p>
      ) : products.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No products yet.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "0.875rem",
          }}
        >
          {products.map((product) => (
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
              <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{priceDisplay(product)}</span>
              <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                Stock: {product.stockQuantity}
              </span>

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

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
  );
}
