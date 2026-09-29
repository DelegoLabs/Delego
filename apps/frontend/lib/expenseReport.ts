/**
 * Custom CSV / JSON expense-report builder (#722).
 *
 * Everything here is client-side: the caller passes the orders it already
 * has in memory and gets back a file to download. No request is made, so
 * nothing about the account leaves the browser beyond the user's own save.
 *
 * Security: merchant-supplied text (merchant name, category, tx hash) is
 * attacker-influenced data. A CSV cell that starts with `=`, `+`, `-`, `@`,
 * TAB or CR is interpreted as a *formula* by Excel, Sheets and LibreOffice,
 * which can leak the rest of the sheet or issue outbound requests. Every
 * cell therefore goes through `sanitizeCsvCell` before serialisation — see
 * `apps/frontend/lib/expenseReport.test.ts`.
 */

import { toCsv } from "./csv";
import { downloadBlob } from "./download";

const STROOPS_PER_XLM = 10_000_000n;

// ─── Types ───────────────────────────────────────────────────────────────────

export type ExportColumn =
  | "orderId"
  | "escrowId"
  | "date"
  | "merchant"
  | "category"
  | "amount"
  | "txHash";

export type ExportFormat = "csv" | "json";

export interface ExportReportConfig {
  /** Inclusive start of the range, `YYYY-MM-DD`. */
  startDate: string;
  /** Inclusive end of the range, `YYYY-MM-DD`. */
  endDate: string;
  format: ExportFormat;
  columns: ExportColumn[];
  filterCategory?: string;
}

/**
 * The subset of an order an expense report needs. Deliberately structural
 * rather than the domain `Order` so the generator stays usable from the
 * receipts/merchant views too.
 */
export interface ExportableOrder {
  id: string;
  escrowId?: string | null;
  merchantId?: string;
  category?: string | null;
  totalStroops?: bigint | string | number | null;
  txHash?: string | null;
  createdAt: Date | string;
}

/** One fully-shaped report line: values are already ordered to match `columns`. */
export type ExpenseReportRow = string[];

export interface ExpenseReportFile {
  filename: string;
  content: string;
  mimeType: string;
  rowCount: number;
}

// ─── Column metadata ─────────────────────────────────────────────────────────

export const EXPORT_COLUMNS: ExportColumn[] = [
  "orderId",
  "escrowId",
  "date",
  "merchant",
  "category",
  "amount",
  "txHash",
];

export const EXPORT_COLUMN_LABELS: Record<ExportColumn, string> = {
  orderId: "Order ID",
  escrowId: "Escrow ID",
  date: "Date",
  merchant: "Merchant",
  category: "Category",
  amount: "Amount (XLM)",
  txHash: "Transaction hash",
};

export const EXPORT_FORMATS: ExportFormat[] = ["csv", "json"];

export function defaultExportReportConfig(): ExportReportConfig {
  const today = new Date();
  const yearAgo = new Date(today);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  return {
    startDate: toDayKey(yearAgo),
    endDate: toDayKey(today),
    format: "csv",
    columns: [...EXPORT_COLUMNS],
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isDayKey(value: string): boolean {
  if (!DAY_KEY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && toDayKey(parsed) === value;
}

/**
 * Returns a human-readable problem with `config`, or null when it is
 * exportable. Every message is written to be shown verbatim next to the
 * "Download" button.
 */
export function validateExportConfig(config: ExportReportConfig): string | null {
  if (!isDayKey(config.startDate) || !isDayKey(config.endDate)) {
    return "Choose a valid start and end date.";
  }
  if (config.startDate > config.endDate) {
    return "The start date must be on or before the end date.";
  }
  if (config.columns.length === 0) {
    return "Select at least one column to export.";
  }
  return null;
}

// ─── Sanitisation ────────────────────────────────────────────────────────────

/**
 * Neutralises spreadsheet formula injection.
 *
 * A leading `=`, `+`, `-` or `@` makes Excel/Sheets/LibreOffice treat the
 * cell as a formula; a leading TAB or CR is stripped by some importers and
 * re-introduces the same problem. Prefixing with an apostrophe forces the
 * cell to be read as text.
 *
 * Only genuinely dangerous values are touched — RFC 4180 quoting of commas,
 * quotes and newlines is `toCsv`'s job, so an ordinary "Acme, Inc." merchant
 * name stays readable in the exported file.
 */
export function sanitizeCsvCell(value: string): string {
  if (value.length === 0) return value;
  const stripped = value.replace(/^[\t\r\n]+/, "");
  const first = stripped.charAt(0);
  const dangerous =
    first === "=" || first === "+" || first === "-" || first === "@";
  return dangerous ? `'${stripped}` : value;
}

// ─── Value formatting ────────────────────────────────────────────────────────

/** `YYYY-MM-DD` in UTC — the same day boundary for every user, so exports are comparable. */
export function toDayKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** Full ISO-8601 timestamp for the `date` column; empty when unparseable. */
function toIsoString(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/** Parses a stroops value (bigint, numeric string, or number) into a bigint, or null when unusable. */
export function parseStroops(
  value: bigint | string | number | null | undefined
): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value;
  const trimmed = String(value).trim();
  return /^\d+$/.test(trimmed) ? BigInt(trimmed) : null;
}

/**
 * Exact stroops → XLM string, trailing zeros trimmed but never rounded, so
 * a report reconciles to the ledger to the last stroop.
 */
export function stroopsToXlm(value: bigint | string | number): string {
  const stroops = parseStroops(value);
  if (stroops === null) return "";
  const whole = stroops / STROOPS_PER_XLM;
  const fraction = (stroops % STROOPS_PER_XLM).toString().padStart(7, "0");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole.toString();
}

// ─── Row building ────────────────────────────────────────────────────────────

/** True when `order` falls inside the inclusive day range of `config`. */
export function isWithinDateRange(
  order: ExportableOrder,
  config: Pick<ExportReportConfig, "startDate" | "endDate">
): boolean {
  const day = toDayKey(order.createdAt);
  if (!day) return false;
  return day >= config.startDate && day <= config.endDate;
}

/** Applies the date range and optional category filter, preserving input order. */
export function selectReportableOrders<T extends ExportableOrder>(
  orders: T[],
  config: ExportReportConfig
): T[] {
  const category = config.filterCategory?.trim().toLowerCase();
  return orders.filter((order) => {
    if (!isWithinDateRange(order, config)) return false;
    if (!category) return true;
    return (order.category ?? "").trim().toLowerCase() === category;
  });
}

/** Cell value for one order/column pair. */
export function cellValue(order: ExportableOrder, column: ExportColumn): string {
  switch (column) {
    case "orderId":
      return order.id ?? "";
    case "escrowId":
      return order.escrowId ?? "";
    case "date":
      return toIsoString(order.createdAt);
    case "merchant":
      return order.merchantId ?? "";
    case "category":
      return order.category ?? "";
    case "amount": {
      const stroops = parseStroops(order.totalStroops);
      return stroops === null ? "" : stroopsToXlm(stroops);
    }
    case "txHash":
      return order.txHash ?? "";
    default:
      return "";
  }
}

/**
 * De-duplicates and drops unknown columns while preserving the canonical
 * `EXPORT_COLUMNS` order, so a header row always lines up with its values
 * no matter how the checkbox list was toggled.
 */
export function normalizeColumns(columns: ExportColumn[]): ExportColumn[] {
  const selected = new Set(columns);
  return EXPORT_COLUMNS.filter((column) => selected.has(column));
}

/** Maps orders to report rows in canonical column order. */
export function toReportRows(
  orders: ExportableOrder[],
  columns: ExportColumn[]
): ExpenseReportRow[] {
  const normalized = normalizeColumns(columns);
  return orders.map((order) =>
    normalized.map((column) => sanitizeCsvCell(cellValue(order, column)))
  );
}

// ─── Serialisation ───────────────────────────────────────────────────────────

export function buildExpenseReportCsv(
  rows: ExpenseReportRow[],
  columns: ExportColumn[]
): string {
  const header = normalizeColumns(columns).map((c) => EXPORT_COLUMN_LABELS[c]);
  return toCsv(header, rows);
}

export interface ExpenseReportJson {
  generatedAt: string;
  config: Omit<ExportReportConfig, "columns"> & { columns: ExportColumn[] };
  columnLabels: string[];
  rowCount: number;
  rows: Record<string, string>[];
}

export function buildExpenseReportJson(
  rows: ExpenseReportRow[],
  config: ExportReportConfig
): string {
  const normalized = normalizeColumns(config.columns);
  const payload: ExpenseReportJson = {
    generatedAt: new Date().toISOString(),
    config: { ...config, columns: normalized },
    columnLabels: normalized.map((c) => EXPORT_COLUMN_LABELS[c]),
    rowCount: rows.length,
    rows: rows.map((row) => {
      const record: Record<string, string> = {};
      normalized.forEach((column, index) => {
        record[column] = row[index] ?? "";
      });
      return record;
    }),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** `delego-expenses-2026-01-01-to-2026-03-31.csv` */
export function expenseReportFilename(config: ExportReportConfig): string {
  const extension = config.format === "json" ? "json" : "csv";
  return `delego-expenses-${config.startDate}-to-${config.endDate}.${extension}`;
}

/**
 * Serialises `orders` according to `config`. Throws when the config is not
 * exportable so a misconfigured UI can never produce a malformed file —
 * callers should run `validateExportConfig` first.
 */
export function buildExpenseReport(
  orders: ExportableOrder[],
  config: ExportReportConfig
): ExpenseReportFile {
  const error = validateExportConfig(config);
  if (error) throw new Error(error);

  const selected = selectReportableOrders(orders, config);
  const rows = toReportRows(selected, config.columns);

  return {
    filename: expenseReportFilename(config),
    content:
      config.format === "json"
        ? buildExpenseReportJson(rows, config)
        : buildExpenseReportCsv(rows, config.columns),
    mimeType: config.format === "json" ? "application/json" : "text/csv;charset=utf-8;",
    rowCount: rows.length,
  };
}

/** Builds the report and hands it to the browser as a download. */
export function downloadExpenseReport(
  orders: ExportableOrder[],
  config: ExportReportConfig
): ExpenseReportFile {
  const file = buildExpenseReport(orders, config);
  downloadBlob(
    file.filename,
    new Blob([file.content], { type: file.mimeType })
  );
  return file;
}
