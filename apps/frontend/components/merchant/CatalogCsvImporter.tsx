"use client";

import { useRef, useState, type DragEvent } from "react";
import { Button } from "@delegolabs/ui";
import {
  CSV_IMPORT_BATCH_SIZE,
  CSV_IMPORT_HEADERS,
  CSV_IMPORT_MAX_BYTES,
  CSV_IMPORT_SAMPLE_FILENAME,
  buildSampleCatalogCsv,
  chunkCsvImportRows,
  collectCsvImportCellErrors,
  csvImportRowCellErrors,
  revalidateCsvImportRow,
  summarizeCsvImport,
  type CsvImportRow,
  type CsvImportSummary,
} from "../../lib/csvCatalogImport";
import { parseCsvCatalogInWorker } from "../../lib/csvCatalogImportWorkerClient";

export interface CatalogCsvImporterProps {
  /** Called once per batch of valid rows. */
  onImport: (rows: CsvImportRow[]) => Promise<void>;
  onImported?: () => void;
  parseCsv?: (csvText: string) => Promise<CsvImportSummary>;
}

/**
 * Drag-and-drop catalog CSV importer. Parsing runs in a worker; invalid rows
 * stay editable before the valid ones are submitted in batches (#909).
 */
export function CatalogCsvImporter({
  onImport,
  onImported,
  parseCsv = parseCsvCatalogInWorker,
}: CatalogCsvImporterProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<CsvImportSummary | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  async function ingest(file: File) {
    setFileError(null);
    setImportError(null);
    setSummary(null);
    if (file.size > CSV_IMPORT_MAX_BYTES) {
      setFileError("CSV files must be 5MB or smaller.");
      return;
    }
    const text = await file.text();
    try {
      setSummary(await parseCsv(text));
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Could not parse that CSV.");
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void ingest(file);
  }

  function updateCell(rowNumber: number, field: "sku" | "title" | "priceStroops" | "stock", value: string) {
    setSummary((current) => {
      if (!current) return current;
      const parsedProducts = current.parsedProducts.map((row) => {
        if (row.rowNumber !== rowNumber) return row;
        const next: CsvImportRow = {
          ...row,
          [field]: field === "stock" ? Number(value) : value,
        };
        return revalidateCsvImportRow(next);
      });
      return summarizeCsvImport(parsedProducts);
    });
  }

  async function submit() {
    if (!summary) return;
    const valid = summary.parsedProducts.filter((row) => row.isValid);
    if (valid.length === 0) return;
    setImporting(true);
    setImportError(null);
    try {
      for (const batch of chunkCsvImportRows(valid, CSV_IMPORT_BATCH_SIZE)) {
        await onImport(batch);
      }
      setSummary(null);
      onImported?.();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  function downloadSampleCsv() {
    const csv = buildSampleCatalogCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = CSV_IMPORT_SAMPLE_FILENAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const cellErrors = summary ? collectCsvImportCellErrors(summary.parsedProducts) : [];

  return (
    <section aria-label="Bulk catalog import" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        style={{
          border: `1px dashed ${dragActive ? "#2563eb" : "#d1d5db"}`,
          borderRadius: "0.75rem",
          padding: "1rem",
          background: dragActive ? "#eff6ff" : "#f9fafb",
        }}
      >
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem" }}>
          Drop a CSV (max 5MB) with columns {CSV_IMPORT_HEADERS.join(", ")}. Imported products are listed in USDC.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            aria-label="Catalog CSV file"
            data-testid="catalog-csv-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void ingest(file);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={downloadSampleCsv}
            data-testid="catalog-csv-download-sample"
          >
            Download sample CSV
          </Button>
        </div>
      </div>

      {fileError ? (
        <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: "0.8125rem" }}>
          {fileError}
        </p>
      ) : null}

      {summary ? (
        <>
          <p data-testid="catalog-csv-summary" style={{ margin: 0, fontSize: "0.8125rem" }}>
            {summary.validRows} valid, {summary.errorRows} invalid, {summary.totalRows} total
          </p>
          {cellErrors.length > 0 ? (
            <div
              role="region"
              aria-label="Validation errors"
              data-testid="catalog-csv-error-table-container"
              style={{
                border: "1px solid #fecaca",
                borderRadius: "0.5rem",
                background: "#fef2f2",
                padding: "0.75rem",
                overflowX: "auto",
              }}
            >
              <p style={{ margin: "0 0 0.5rem", color: "#991b1b", fontSize: "0.8125rem", fontWeight: 600 }}>
                Validation errors ({cellErrors.length})
              </p>
              <table
                data-testid="catalog-csv-error-table"
                style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}
              >
                <thead>
                  <tr>
                    {["Row", "Column", "Error"].map((heading) => (
                      <th
                        key={heading}
                        style={{
                          textAlign: "left",
                          padding: "0.375rem",
                          borderBottom: "1px solid #fecaca",
                          color: "#7f1d1d",
                        }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cellErrors.map((err, index) => (
                    <tr
                      key={`${err.rowNumber}-${err.column}-${index}`}
                      data-testid={`catalog-csv-error-row-${err.rowNumber}-${err.column}`}
                    >
                      <td style={{ padding: "0.375rem", color: "#7f1d1d" }}>{err.rowNumber}</td>
                      <td style={{ padding: "0.375rem", fontFamily: "monospace", color: "#7f1d1d" }}>{err.column}</td>
                      <td style={{ padding: "0.375rem", color: "#b91c1c" }}>{err.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr>
                  {["Row", "SKU", "Title", "Price (stroops)", "Stock"].map((heading) => (
                    <th key={heading} style={{ textAlign: "left", padding: "0.375rem" }}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.parsedProducts.map((row) => {
                  const invalidColumns = new Set(
                    csvImportRowCellErrors(row, row.rowNumber).map((err) => err.column)
                  );
                  return (
                    <tr
                      key={row.rowNumber}
                      data-testid={`catalog-csv-row-${row.rowNumber}`}
                      data-valid={row.isValid ? "true" : "false"}
                      title={row.errors.join(" ")}
                      style={{ background: row.isValid ? "transparent" : "#fef2f2" }}
                    >
                      <td style={{ padding: "0.375rem" }}>{row.rowNumber}</td>
                      {(["sku", "title", "priceStroops"] as const).map((field) => (
                        <td key={field} style={{ padding: "0.375rem" }}>
                          <input
                            aria-label={`${field} row ${row.rowNumber}`}
                            aria-invalid={invalidColumns.has(field)}
                            value={row[field]}
                            onChange={(event) => updateCell(row.rowNumber, field, event.target.value)}
                          />
                        </td>
                      ))}
                      <td style={{ padding: "0.375rem" }}>
                        <input
                          aria-label={`stock row ${row.rowNumber}`}
                          aria-invalid={invalidColumns.has("stock")}
                          value={Number.isFinite(row.stock) ? String(row.stock) : ""}
                          onChange={(event) => updateCell(row.rowNumber, "stock", event.target.value)}
                        />
                        {row.errors.length > 0 ? (
                          <span style={{ display: "block", color: "#b91c1c", fontSize: "0.75rem" }}>
                            {row.errors.join(" ")}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button type="button" onClick={() => void submit()} disabled={importing || summary.validRows === 0} data-testid="catalog-csv-submit">
            {importing ? "Importing…" : `Import ${summary.validRows} valid products`}
          </Button>
        </>
      ) : null}

      {importError ? (
        <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: "0.8125rem" }}>
          {importError}
        </p>
      ) : null}
    </section>
  );
}
