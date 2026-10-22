"use client";

import { useTranslations } from "next-intl";

export interface BulkFulfillActionBarProps {
  selectedCount: number;
  onBulkFulfill: () => void;
  onClearSelection: () => void;
  /** Disables the actions while a batch is being submitted. */
  busy?: boolean;
}

/** Sticky bar shown while 1+ merchant orders are selected (#1014). */
export function BulkFulfillActionBar({
  selectedCount,
  onBulkFulfill,
  onClearSelection,
  busy = false,
}: BulkFulfillActionBarProps) {
  const t = useTranslations("bulkFulfillment");

  if (selectedCount === 0) return null;

  return (
    <div
      role="region"
      aria-label={t("actionBarLabel")}
      style={{
        position: "sticky",
        bottom: "1rem",
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        borderRadius: "0.75rem",
        border: "1px solid #bfdbfe",
        background: "#eff6ff",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      <span aria-live="polite" style={{ fontWeight: 600, fontSize: "0.875rem" }}>
        {t("selectedCount", { count: selectedCount })}
      </span>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          onClick={onClearSelection}
          disabled={busy}
          style={{
            padding: "0.5rem 0.875rem",
            borderRadius: "0.5rem",
            border: "1px solid #d1d5db",
            background: "#fff",
            fontWeight: 600,
            fontSize: "0.8125rem",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {t("clearSelection")}
        </button>
        <button
          type="button"
          onClick={onBulkFulfill}
          disabled={busy}
          style={{
            padding: "0.5rem 0.875rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 600,
            fontSize: "0.8125rem",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {t("bulkFulfill")}
        </button>
      </div>
    </div>
  );
}
