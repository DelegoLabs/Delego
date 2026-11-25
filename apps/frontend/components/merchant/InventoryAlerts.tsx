"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export const SNOOZED_ALERTS_STORAGE_KEY = "delego.merchant.snoozedInventoryAlerts";
export const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;
const SNOOZED_ALERTS_EVENT = "delego:snoozed-inventory-alerts";

export type SnoozedAlertsMap = Record<string, number>;

/** Reads active (non-expired) SKU snooze timestamps from localStorage. */
export function readSnoozedAlerts(now = Date.now()): SnoozedAlertsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SNOOZED_ALERTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const active: SnoozedAlertsMap = {};
    for (const [sku, expiresAt] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt > now) {
        active[sku] = expiresAt;
      }
    }
    return active;
  } catch {
    return {};
  }
}

/** Persists SKU snooze timestamps to localStorage and notifies listeners. */
export function writeSnoozedAlerts(map: SnoozedAlertsMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNOOZED_ALERTS_STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(SNOOZED_ALERTS_EVENT, { detail: map }));
  } catch {
    // Private mode or storage quota — callers still keep in-memory state.
  }
}

function subscribeSnoozedAlerts(listener: (map: SnoozedAlertsMap) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<SnoozedAlertsMap>).detail;
    listener(detail ?? readSnoozedAlerts());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SNOOZED_ALERTS_STORAGE_KEY) return;
    listener(readSnoozedAlerts());
  };
  window.addEventListener(SNOOZED_ALERTS_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SNOOZED_ALERTS_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

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

/** Summary of depleted catalog rows, with per-SKU 24h snooze/acknowledge and a link to edit counts. */
export function LowStockBanner({ products }: { products: StockedCatalogProduct[] }) {
  const [threshold, setThreshold] = useState(DEFAULT_LOW_STOCK_THRESHOLD);
  const [snoozed, setSnoozed] = useState<SnoozedAlertsMap>({});
  const [showSnoozed, setShowSnoozed] = useState(false);

  useEffect(() => {
    setThreshold(readLowStockThreshold());
    const unsubThreshold = subscribeLowStockThreshold(setThreshold);
    setSnoozed(readSnoozedAlerts());
    const unsubSnoozed = subscribeSnoozedAlerts(setSnoozed);
    return () => {
      unsubThreshold();
      unsubSnoozed();
    };
  }, []);

  const depleted = useMemo(
    () => listDepletedInventory(products, threshold),
    [products, threshold]
  );

  const { activeAlerts, snoozedAlerts } = useMemo(() => {
    const now = Date.now();
    const active: typeof depleted = [];
    const hidden: typeof depleted = [];
    for (const item of depleted) {
      const expiresAt = snoozed[item.sku];
      if (typeof expiresAt === "number" && expiresAt > now) {
        hidden.push(item);
      } else {
        active.push(item);
      }
    }
    return { activeAlerts: active, snoozedAlerts: hidden };
  }, [depleted, snoozed]);

  const handleSnooze = useCallback((sku: string) => {
    const now = Date.now();
    const current = readSnoozedAlerts(now);
    const next: SnoozedAlertsMap = { ...current, [sku]: now + SNOOZE_DURATION_MS };
    setSnoozed(next);
    writeSnoozedAlerts(next);
  }, []);

  const handleUnsnooze = useCallback((sku: string) => {
    const now = Date.now();
    const next: SnoozedAlertsMap = { ...readSnoozedAlerts(now) };
    delete next[sku];
    setSnoozed(next);
    writeSnoozedAlerts(next);
  }, []);

  if (depleted.length === 0) return null;

  const actionButtonStyle = {
    padding: "0.1875rem 0.5rem",
    borderRadius: "0.375rem",
    border: "1px solid #d97706",
    background: "#ffffff",
    color: "#92400e",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
  } as const;

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
        border: `1px solid ${activeAlerts.length > 0 ? "#fcd34d" : "#e5e7eb"}`,
        background: activeAlerts.length > 0 ? "#fffbeb" : "#f9fafb",
      }}
    >
      {activeAlerts.length > 0 ? (
        <>
          <strong style={{ fontSize: "0.875rem", color: "#92400e" }}>
            {activeAlerts.length} product{activeAlerts.length === 1 ? "" : "s"} need attention
          </strong>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.1rem",
              fontSize: "0.8125rem",
              color: "#78350f",
              display: "flex",
              flexDirection: "column",
              gap: "0.375rem",
            }}
          >
            {activeAlerts.map((item) => (
              <li
                key={item.productId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                <span>
                  {item.title} ({item.sku}) —{" "}
                  {item.isOutOfStock ? "Out of Stock" : `Low Stock (${item.currentStock} left)`}
                </span>
                <button
                  type="button"
                  onClick={() => handleSnooze(item.sku)}
                  aria-label={`Snooze ${item.title} (${item.sku}) for 24 hours`}
                  style={actionButtonStyle}
                >
                  Snooze 24h
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <span style={{ fontSize: "0.8125rem", color: "#4b5563" }}>
          All {snoozedAlerts.length} low-stock alert{snoozedAlerts.length === 1 ? "" : "s"} snoozed
          for 24h.
        </span>
      )}

      {snoozedAlerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <button
            type="button"
            aria-expanded={showSnoozed}
            onClick={() => setShowSnoozed((prev) => !prev)}
            style={{
              alignSelf: "flex-start",
              padding: 0,
              border: "none",
              background: "transparent",
              color: "#92400e",
              fontSize: "0.8125rem",
              fontWeight: 600,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            {showSnoozed ? "Hide" : "View"} snoozed alerts ({snoozedAlerts.length})
          </button>

          {showSnoozed && (
            <ul
              data-testid="snoozed-alerts-list"
              style={{
                margin: 0,
                paddingLeft: "1.1rem",
                fontSize: "0.8125rem",
                color: "#6b7280",
                display: "flex",
                flexDirection: "column",
                gap: "0.375rem",
              }}
            >
              {snoozedAlerts.map((item) => (
                <li
                  key={item.productId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    {item.title} ({item.sku}) —{" "}
                    {item.isOutOfStock ? "Out of Stock" : `Low Stock (${item.currentStock} left)`}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUnsnooze(item.sku)}
                    aria-label={`Unsnooze ${item.title} (${item.sku})`}
                    style={{
                      ...actionButtonStyle,
                      border: "1px solid #d1d5db",
                      color: "#374151",
                    }}
                  >
                    Unsnooze
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <a href="/merchant/catalog" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#b45309" }}>
        Edit product counts
      </a>
    </section>
  );
}
