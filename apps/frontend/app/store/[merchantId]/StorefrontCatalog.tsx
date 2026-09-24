"use client";

import { useMemo, useState } from "react";
import { formatAmount } from "@delegolabs/ui";
import {
  filterStoreProducts,
  type MerchantProduct,
} from "../../../lib/storefront";

function formatPrice(priceStroops: string): string {
  if (!/^\d+$/.test(priceStroops)) return priceStroops;
  try {
    const formatted = formatAmount(BigInt(priceStroops));
    return `${formatted.value} ${formatted.symbol}`.trim();
  } catch {
    return priceStroops;
  }
}

export function StorefrontCatalog({ products }: { products: MerchantProduct[] }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () => filterStoreProducts(products, query),
    [products, query]
  );

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <label htmlFor="store-product-search" style={{ fontWeight: 500 }}>
        Search products
      </label>
      <input
        id="store-product-search"
        type="search"
        className="order-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search this store"
      />

      {products.length === 0 && <p>This store has no active products.</p>}
      {products.length > 0 && visible.length === 0 && (
        <p>No products match that search.</p>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
        {visible.map((product) => (
          <li
            key={product.id}
            className="card"
            style={{ padding: "0.875rem" }}
          >
            <h2 style={{ margin: "0 0 0.25rem", fontSize: "1rem" }}>{product.name}</h2>
            {product.description && (
              <p style={{ margin: "0 0 0.5rem" }}>{product.description}</p>
            )}
            <p style={{ margin: 0, fontWeight: 600 }}>{formatPrice(product.priceStroops)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
