"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { SHIPPING_CARRIERS, type ShippingCarrier } from "../../lib/shipments";
import {
  parseBulkFulfillmentCsv,
  validateBulkFulfillment,
  type BulkFulfillmentItem,
  type BulkFulfillmentRowError,
} from "../../lib/bulkFulfillment";

export interface BulkFulfillModalProps {
  open: boolean;
  /** The selected orders being fulfilled. */
  orderIds: string[];
  onClose: () => void;
  /** Receives validated items, one per order, with normalized carrier codes. */
  onSubmit: (items: BulkFulfillmentItem[]) => void;
}

type Mode = "manual" | "csv";

interface ManualRow {
  carrier: ShippingCarrier;
  trackingNumber: string;
}

const fieldStyle = {
  padding: "0.5rem 0.625rem",
  borderRadius: "0.5rem",
  border: "1px solid #d1d5db",
  fontSize: "0.8125rem",
} as const;

/** Modal for assigning carriers + tracking numbers to many orders, by hand or from a CSV (#1014). */
export function BulkFulfillModal({ open, orderIds, onClose, onSubmit }: BulkFulfillModalProps) {
  const t = useTranslations("bulkFulfillment");
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const panelRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("manual");
  const [manual, setManual] = useState<Record<string, ManualRow>>({});
  const [showManualErrors, setShowManualErrors] = useState(false);
  const [csvText, setCsvText] = useState("");

  useFocusTrap({ containerRef: panelRef, isActive: open, onEscape: onClose });

  const manualItems: BulkFulfillmentItem[] = orderIds.map((orderId) => ({
    orderId,
    carrier: manual[orderId]?.carrier ?? "fedex",
    trackingNumber: manual[orderId]?.trackingNumber ?? "",
  }));
  const manualResult = validateBulkFulfillment(manualItems, orderIds);
  const csvResult = useMemo(
    () => (csvText.trim() ? parseBulkFulfillmentCsv(csvText, orderIds) : null),
    [csvText, orderIds]
  );

  if (!open) return null;

  function errorMessage(error: BulkFulfillmentRowError): string {
    const message = t(`errors.${error.code}`, { orderId: error.orderId ?? "" });
    return error.line ? t("csvLineError", { line: error.line, message }) : message;
  }

  function updateManual(orderId: string, patch: Partial<ManualRow>) {
    setManual((prev) => ({
      ...prev,
      [orderId]: { ...(prev[orderId] ?? { carrier: "fedex", trackingNumber: "" }), ...patch },
    }));
  }

  const csvItems = csvResult?.items ?? [];
  const csvMissing = csvResult
    ? orderIds.filter((id) => !csvItems.some((item) => item.orderId === id))
    : [];
  const submitCount = mode === "manual" ? orderIds.length : csvItems.length;
  const csvReady = csvResult !== null && csvResult.errors.length === 0 && csvItems.length > 0;

  function handleSubmit() {
    if (mode === "manual") {
      if (manualResult.errors.length > 0) {
        setShowManualErrors(true);
        return;
      }
      onSubmit(manualResult.items);
    } else if (csvReady) {
      onSubmit(csvItems);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setCsvText(await file.text());
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          background: "#fff",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          width: "100%",
          maxWidth: 640,
          maxHeight: "90vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 id={titleId} style={{ margin: 0 }}>
            {t("modalTitle", { count: orderIds.length })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            style={{ border: "none", background: "transparent", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", gap: "1rem" }}>
          <legend style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>
            {t("modeLabel")}
          </legend>
          {(["manual", "csv"] as const).map((value) => (
            <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.8125rem" }}>
              <input
                type="radio"
                name={`${baseId}-mode`}
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {value === "manual" ? t("modeManual") : t("modeCsv")}
            </label>
          ))}
        </fieldset>

        {mode === "manual" ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {orderIds.map((orderId) => {
              const row = manual[orderId];
              const error = showManualErrors
                ? manualResult.errors.find((e) => e.orderId === orderId)
                : undefined;
              const errorId = `${baseId}-${orderId}-error`;
              return (
                <li key={orderId}>
                  <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "0.625rem", margin: 0 }}>
                    <legend style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                      {t("orderLabel", { orderId })}
                    </legend>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.75rem" }}>
                        {t("carrier")}
                        <select
                          value={row?.carrier ?? "fedex"}
                          onChange={(e) => updateManual(orderId, { carrier: e.target.value as ShippingCarrier })}
                          style={fieldStyle}
                        >
                          {SHIPPING_CARRIERS.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.75rem", flex: 1, minWidth: "12rem" }}>
                        {t("trackingNumber")}
                        <input
                          type="text"
                          value={row?.trackingNumber ?? ""}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? errorId : undefined}
                          onChange={(e) => updateManual(orderId, { trackingNumber: e.target.value })}
                          style={{ ...fieldStyle, borderColor: error ? "#dc2626" : "#d1d5db" }}
                        />
                      </label>
                    </div>
                    {error && (
                      <span id={errorId} style={{ display: "block", marginTop: "0.25rem", fontSize: "0.75rem", color: "#dc2626" }}>
                        {errorMessage(error)}
                      </span>
                    )}
                  </fieldset>
                </li>
              );
            })}
          </ul>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280" }}>{t("csvHint")}</p>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8125rem", fontWeight: 600 }}>
              {t("csvFile")}
              <input type="file" accept=".csv,text/csv" onChange={(e) => void handleFile(e.target.files?.[0])} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8125rem", fontWeight: 600 }}>
              {t("csvText")}
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={5}
                spellCheck={false}
                placeholder={"orderId,carrier,trackingNumber"}
                style={{ ...fieldStyle, fontFamily: "monospace" }}
              />
            </label>

            {csvResult && csvResult.errors.length > 0 && (
              <ul role="alert" style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.75rem", color: "#dc2626" }}>
                {csvResult.errors.map((error, i) => (
                  <li key={i}>{errorMessage(error)}</li>
                ))}
              </ul>
            )}

            {csvItems.length > 0 && (
              <table className="comparison-table" style={{ fontSize: "0.8125rem" }}>
                <caption style={{ textAlign: "left", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {t("csvPreview")}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{t("order")}</th>
                    <th scope="col">{t("carrier")}</th>
                    <th scope="col">{t("trackingNumber")}</th>
                  </tr>
                </thead>
                <tbody>
                  {csvItems.map((item) => (
                    <tr key={item.orderId}>
                      <td>{item.orderId}</td>
                      <td>{SHIPPING_CARRIERS.find((c) => c.value === item.carrier)?.label ?? item.carrier}</td>
                      <td>{item.trackingNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {csvMissing.length > 0 && (
              <p role="status" style={{ margin: 0, fontSize: "0.75rem", color: "#92400e" }}>
                {t("csvMissing", { count: csvMissing.length, orderIds: csvMissing.join(", ") })}
              </p>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={onClose}
            style={{ ...fieldStyle, background: "#fff", fontWeight: 600, cursor: "pointer" }}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={mode === "csv" && !csvReady}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.8125rem",
              cursor: mode === "csv" && !csvReady ? "not-allowed" : "pointer",
              opacity: mode === "csv" && !csvReady ? 0.6 : 1,
            }}
          >
            {t("submit", { count: submitCount })}
          </button>
        </div>
      </div>
    </div>
  );
}
