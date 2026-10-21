"use client";

import { useState } from "react";

export interface LowStockBannerAlert {
  depletedProductsCount: number;
  criticalItemTitles: string[];
  onQuickRestockClick: () => void;
  hasOutOfStock?: boolean;
  severity?: "amber" | "red";
  onDismiss?: () => void;
  dismissible?: boolean;
}

export function LowStockBannerAlert({
  depletedProductsCount,
  criticalItemTitles,
  onQuickRestockClick,
  hasOutOfStock,
  severity,
  onDismiss,
  dismissible = true,
}: LowStockBannerAlert) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || depletedProductsCount <= 0) {
    return null;
  }

  const tone: "amber" | "red" =
    severity ?? (hasOutOfStock ? "red" : "amber");

  const isRed = tone === "red";

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <aside
      role="alert"
      aria-live="assertive"
      data-testid="low-stock-banner-alert"
      data-severity={tone}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.625rem",
        padding: "1rem 1.25rem",
        borderRadius: "0.75rem",
        background: isRed ? "#fef2f2" : "#fffbeb",
        border: `1px solid ${isRed ? "#fecaca" : "#fcd34d"}`,
        boxShadow: isRed
          ? "0 4px 6px -1px rgba(239, 68, 68, 0.1)"
          : "0 4px 6px -1px rgba(245, 158, 11, 0.1)",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", flex: "1 1 280px" }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "1.75rem",
              height: "1.75rem",
              borderRadius: "50%",
              background: isRed ? "#fee2e2" : "#fef3c7",
              color: isRed ? "#dc2626" : "#d97706",
              fontSize: "1rem",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {isRed ? "⚠️" : "⚡"}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <h2
              style={{
                margin: 0,
                fontSize: "1rem",
                fontWeight: 700,
                color: isRed ? "#991b1b" : "#92400e",
              }}
            >
              {isRed
                ? "Critical Stock Warning: Depleted Catalog Items"
                : "Low Stock Warning: Action Required"}
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "0.875rem",
                color: isRed ? "#b91c1c" : "#b45309",
              }}
            >
              {depletedProductsCount} catalog item
              {depletedProductsCount === 1 ? "" : "s"}{" "}
              {isRed ? "out of stock or near depletion" : "running low on inventory"}{" "}
              (&lt; 5 items remaining).
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            type="button"
            data-testid="low-stock-restock-cta"
            onClick={onQuickRestockClick}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              background: isRed ? "#dc2626" : "#d97706",
              color: "#ffffff",
              border: "none",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
              boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
            }}
          >
            Restock
          </button>

          {dismissible && (
            <button
              type="button"
              aria-label="Dismiss alert"
              data-testid="low-stock-dismiss-button"
              onClick={handleDismiss}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0.375rem 0.5rem",
                borderRadius: "0.375rem",
                color: isRed ? "#991b1b" : "#92400e",
                fontSize: "1rem",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {criticalItemTitles.length > 0 && (
        <div
          data-testid="critical-items-list"
          style={{
            marginTop: "0.25rem",
            paddingTop: "0.5rem",
            borderTop: `1px solid ${isRed ? "#fee2e2" : "#fef3c7"}`,
            fontSize: "0.8125rem",
            color: isRed ? "#7f1d1d" : "#78350f",
          }}
        >
          <span style={{ fontWeight: 600 }}>Affected items: </span>
          {criticalItemTitles.join(", ")}
        </div>
      )}
    </aside>
  );
}
