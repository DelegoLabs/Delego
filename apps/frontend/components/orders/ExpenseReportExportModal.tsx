"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  EXPORT_COLUMNS,
  EXPORT_COLUMN_LABELS,
  EXPORT_FORMATS,
  defaultExportReportConfig,
  downloadExpenseReport,
  normalizeColumns,
  validateExportConfig,
  type ExportColumn,
  type ExportFormat,
  type ExportReportConfig,
  type ExportableOrder,
} from "../../lib/expenseReport";

export interface ExpenseReportExportModalProps {
  isOpen: boolean;
  orders: ExportableOrder[];
  onClose: () => void;
  /** Categories present in `orders`, offered as a filter. */
  categories?: string[];
}

type Status = "idle" | "done" | "error";

/**
 * Expense-report export dialog (#722): a date range, a checkbox per column, an
 * optional category filter, and a CSV/JSON choice. Generation and download
 * both happen in the browser — see `lib/expenseReport.ts`.
 */
export function ExpenseReportExportModal({
  isOpen,
  orders,
  onClose,
  categories = [],
}: ExpenseReportExportModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<ExportReportConfig>(() =>
    defaultExportReportConfig()
  );
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useFocusTrap(panelRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // Reset to defaults each time the dialog is opened so a previous half-filled
  // range never silently re-scopes the next export.
  useEffect(() => {
    if (!isOpen) return;
    setConfig(defaultExportReportConfig());
    setStatus("idle");
    setMessage(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const validationError = validateExportConfig(config);
  const selectedCount = normalizeColumns(config.columns).length;

  function toggleColumn(column: ExportColumn) {
    setStatus("idle");
    setMessage(null);
    setConfig((prev) => ({
      ...prev,
      columns: prev.columns.includes(column)
        ? prev.columns.filter((c) => c !== column)
        : [...prev.columns, column],
    }));
  }

  function handleDownload() {
    const error = validateExportConfig(config);
    if (error) {
      setStatus("error");
      setMessage(error);
      return;
    }
    try {
      const file = downloadExpenseReport(orders, config);
      setStatus("done");
      setMessage(
        file.rowCount === 1
          ? "Exported 1 row."
          : `Exported ${file.rowCount} rows.`
      );
    } catch {
      setStatus("error");
      setMessage("The export could not be generated. Try again.");
    }
  }

  return (
    <div className="approval-drawer-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Export expense report"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="export-report-modal"
        style={{
          background: "var(--color-bg-surface, #fff)",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          maxWidth: "34rem",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          margin: "5vh auto",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <header>
          <h2 style={{ margin: 0 }}>Export expense report</h2>
          <p className="stat-label" style={{ margin: 0 }}>
            Build a CSV or JSON file for tax and accounting. Generated in your
            browser — nothing is uploaded.
          </p>
        </header>

        <Card title="Date range">
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <label
              style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
              htmlFor="export-start-date"
            >
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Start date</span>
              <input
                id="export-start-date"
                type="date"
                value={config.startDate}
                onChange={(e) => {
                  setStatus("idle");
                  setMessage(null);
                  setConfig((prev) => ({ ...prev, startDate: e.target.value }));
                }}
              />
            </label>
            <label
              style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
              htmlFor="export-end-date"
            >
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>End date</span>
              <input
                id="export-end-date"
                type="date"
                value={config.endDate}
                onChange={(e) => {
                  setStatus("idle");
                  setMessage(null);
                  setConfig((prev) => ({ ...prev, endDate: e.target.value }));
                }}
              />
            </label>
          </div>

          {categories.length > 0 && (
            <label
              style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.75rem" }}
              htmlFor="export-category"
            >
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                Category filter
              </span>
              <select
                id="export-category"
                value={config.filterCategory ?? ""}
                onChange={(e) => {
                  setStatus("idle");
                  setMessage(null);
                  setConfig((prev) => ({
                    ...prev,
                    filterCategory: e.target.value || undefined,
                  }));
                }}
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Card>

        <fieldset style={{ border: "1px solid var(--color-border, #e5e7eb)", borderRadius: "0.5rem", padding: "0.75rem" }}>
          <legend style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            Columns ({selectedCount} selected)
          </legend>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {EXPORT_COLUMNS.map((column) => (
              <label
                key={column}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem" }}
              >
                <input
                  type="checkbox"
                  checked={config.columns.includes(column)}
                  onChange={() => toggleColumn(column)}
                />
                {EXPORT_COLUMN_LABELS[column]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset style={{ border: "1px solid var(--color-border, #e5e7eb)", borderRadius: "0.5rem", padding: "0.75rem" }}>
          <legend style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Format</legend>
          <div style={{ display: "flex", gap: "1rem" }}>
            {EXPORT_FORMATS.map((format: ExportFormat) => (
              <label
                key={format}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem" }}
              >
                <input
                  type="radio"
                  name="export-format"
                  value={format}
                  checked={config.format === format}
                  onChange={() => {
                    setStatus("idle");
                    setMessage(null);
                    setConfig((prev) => ({ ...prev, format }));
                  }}
                />
                {format.toUpperCase()}
              </label>
            ))}
          </div>
        </fieldset>

        {message && (
          <p
            role="status"
            style={{
              margin: 0,
              fontSize: "0.8125rem",
              color:
                status === "error"
                  ? "var(--color-danger, #dc2626)"
                  : "var(--color-success, #16a34a)",
            }}
          >
            {message}
          </p>
        )}

        <div className="form-actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleDownload}
            disabled={validationError !== null}
          >
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}
