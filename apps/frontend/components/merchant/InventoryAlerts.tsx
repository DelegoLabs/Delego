"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  evaluateInventoryStock,
  listDepletedInventory,
  normalizeThreshold,
  readLowStockThreshold,
  subscribeLowStockThreshold,
  writeLowStockThreshold,
  type StockedCatalogProduct,
} from "../../lib/inventoryStock";

export { LowStockBannerAlert } from "./LowStockBannerAlert";
export type { LowStockBannerAlert as LowStockBannerAlertProps } from "./LowStockBannerAlert";

const badgeStyle = (tone: "amber" | "red") =>
  ({
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    padding: "0.125rem 0.5rem",
    borderRadius: "999px",
    fontSize: "0.75rem",
    fontWeight: 700,
    background: tone === "amber" ? "#fffbeb" : "#fef2f2",
    color: tone === "amber" ? "#b45309" : "#b91c1c",
    border: `1px solid ${tone === "amber" ? "#fcd34d" : "#fecaca"}`,
  }) as const;

/** Amber "Low Stock (N left)" or red "Out of Stock" for a catalog row. */
export function LowStockBadge({
  stockQuantity,
  threshold,
}: {
  stockQuantity: number;
  threshold: number;
}) {
  const status = evaluateInventoryStock({
    productId: "",
    sku: "",
    title: "",
    currentStock: stockQuantity,
    threshold,
  });
  if (status.isOutOfStock) {
    return (
      <span style={badgeStyle("red")} data-testid="stock-badge-out">
        Out of Stock
      </span>
    );
  }
  if (status.isLowStock) {
    return (
      <span style={badgeStyle("amber")} data-testid="stock-badge-low">
        Low Stock ({status.currentStock} left)
      </span>
    );
  }
  return null;
}

/** Catalog setting that controls when the low-stock badge appears. */
export function InventoryThresholdField() {
  const [threshold, setThreshold] = useState(DEFAULT_LOW_STOCK_THRESHOLD);
  const [draft, setDraft] = useState(String(DEFAULT_LOW_STOCK_THRESHOLD));

  useEffect(() => {
    const current = readLowStockThreshold();
    setThreshold(current);
    setDraft(String(current));
    return subscribeLowStockThreshold((next) => {
      setThreshold(next);
      setDraft(String(next));
    });
  }, []);

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxWidth: "16rem" }}>
      <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Low-stock threshold</span>
      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={draft}
        aria-describedby="low-stock-threshold-hint"
        onChange={(event) => {
          const value = event.target.value;
          setDraft(value);
          if (/^\d+$/.test(value.trim())) {
            const next = writeLowStockThreshold(normalizeThreshold(value));
            setThreshold(next);
          }
        }}
        onBlur={() => {
          if (!/^\d+$/.test(draft.trim())) {
            setDraft(String(threshold));
            return;
          }
          const next = writeLowStockThreshold(normalizeThreshold(draft));
          setThreshold(next);
          setDraft(String(next));
        }}
        style={{
          padding: "0.5rem 0.625rem",
          borderRadius: "0.5rem",
          border: "1px solid #d1d5db",
          font: "inherit",
          maxWidth: "8rem",
        }}
      />
      <span id="low-stock-threshold-hint" style={{ fontSize: "0.75rem", color: "#6b7280" }}>
        Products at or below this count show a low-stock badge. Zero disables the warning.
      </span>
    </label>
  );
}

/** Summary of depleted catalog rows, with a link to edit counts. */
export function LowStockBanner({ products }: { products: StockedCatalogProduct[] }) {
  const [threshold, setThreshold] = useState(DEFAULT_LOW_STOCK_THRESHOLD);

  useEffect(() => {
    setThreshold(readLowStockThreshold());
    return subscribeLowStockThreshold(setThreshold);
  }, []);

  const depleted = useMemo(
    () => listDepletedInventory(products, threshold),
    [products, threshold]
  );

  if (depleted.length === 0) return null;

  return (
    <section
      role="status"
      aria-label="Low stock warning"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        padding: "0.875rem 1rem",
        borderRadius: "0.75rem",
        border: "1px solid #fcd34d",
        background: "#fffbeb",
      }}
    >
      <strong style={{ fontSize: "0.875rem", color: "#92400e" }}>
        {depleted.length} product{depleted.length === 1 ? "" : "s"} need attention
      </strong>
      <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.8125rem", color: "#78350f" }}>
        {depleted.map((item) => (
          <li key={item.productId}>
            {item.title} ({item.sku}) —{" "}
            {item.isOutOfStock ? "Out of Stock" : `Low Stock (${item.currentStock} left)`}
          </li>
        ))}
      </ul>
      <a href="/merchant/catalog" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#b45309" }}>
        Edit product counts
      </a>
    </section>
  );
}
