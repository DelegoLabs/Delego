/** Client-side catalog CSV validation for the merchant bulk importer (#909). */

export interface CsvImportRow {
  rowNumber: number;
  sku: string;
  title: string;
  priceStroops: string;
  stock: number;
  errors: string[];
  isValid: boolean;
}

export interface CsvImportSummary {
  totalRows: number;
  validRows: number;
  errorRows: number;
  parsedProducts: CsvImportRow[];
}

export const CSV_IMPORT_HEADERS = ["sku", "title", "priceStroops", "stock"] as const;
export type CsvImportColumn = (typeof CSV_IMPORT_HEADERS)[number];
export const CSV_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_IMPORT_BATCH_SIZE = 50;
export const CSV_IMPORT_SAMPLE_FILENAME = "catalog-import-sample.csv";

export interface CsvImportCellError {
  rowNumber: number;
  column: CsvImportColumn;
  message: string;
}

export function buildSampleCatalogCsv(): string {
  return [
    CSV_IMPORT_HEADERS.join(","),
    "SKU-001,Ceramic Coffee Mug,15000000,25",
    'SKU-002,"Canvas Tote Bag, Large",24500000,12',
  ].join("\n");
}

export function csvImportRowCellErrors(
  row: Pick<CsvImportRow, "sku" | "title" | "priceStroops" | "stock">,
  rowNumber = 0
): CsvImportCellError[] {
  const errors: CsvImportCellError[] = [];
  if (!row.sku.trim()) {
    errors.push({ rowNumber, column: "sku", message: "sku is required." });
  }
  if (!row.title.trim()) {
    errors.push({ rowNumber, column: "title", message: "title is required." });
  }
  if (!/^\d+$/.test(row.priceStroops.trim())) {
    errors.push({
      rowNumber,
      column: "priceStroops",
      message: "priceStroops must be a whole number of stroops.",
    });
  }
  if (!Number.isInteger(row.stock) || row.stock < 0) {
    errors.push({
      rowNumber,
      column: "stock",
      message: "stock must be a non-negative whole number.",
    });
  }
  return errors;
}

export function csvImportRowErrors(row: Pick<CsvImportRow, "sku" | "title" | "priceStroops" | "stock">): string[] {
  return csvImportRowCellErrors(row).map((error) => error.message);
}

export function collectCsvImportCellErrors(rows: CsvImportRow[]): CsvImportCellError[] {
  return rows.flatMap((row) => csvImportRowCellErrors(row, row.rowNumber));
}

export function revalidateCsvImportRow(row: CsvImportRow): CsvImportRow {
  const errors = csvImportRowErrors(row);
  return { ...row, errors, isValid: errors.length === 0 };
}

export function summarizeCsvImport(parsedProducts: CsvImportRow[]): CsvImportSummary {
  const validRows = parsedProducts.filter((row) => row.isValid).length;
  return {
    totalRows: parsedProducts.length,
    validRows,
    errorRows: parsedProducts.length - validRows,
    parsedProducts,
  };
}

export function chunkCsvImportRows<T>(rows: T[], size = CSV_IMPORT_BATCH_SIZE): T[][] {
  if (size <= 0) return rows.length > 0 ? [rows] : [];
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    batches.push(rows.slice(index, index + size));
  }
  return batches;
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function splitCsvRecords(text: string): string[] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const records: string[] = [];
  let buffer: string | null = null;
  for (const line of lines) {
    buffer = buffer === null ? line : `${buffer}\n${line}`;
    const quoteCount = (buffer.match(/"/g) ?? []).length;
    if (quoteCount % 2 === 0) {
      records.push(buffer);
      buffer = null;
    }
  }
  if (buffer !== null && buffer.length > 0) records.push(buffer);
  return records;
}

export function parseCsvCatalogImport(text: string): CsvImportSummary {
  const records = splitCsvRecords(text).filter((line) => line.trim().length > 0);
  if (records.length === 0) {
    throw new Error("The file is empty.");
  }
  const header = splitCsvLine(records[0]).map((cell) => cell.trim().toLowerCase());
  const headerOk = CSV_IMPORT_HEADERS.every(
    (expected, index) => header[index] === expected.toLowerCase()
  );
  if (!headerOk) {
    throw new Error(`Header must be: ${CSV_IMPORT_HEADERS.join(", ")}.`);
  }

  const parsedProducts: CsvImportRow[] = [];
  for (let i = 1; i < records.length; i += 1) {
    const cells = splitCsvLine(records[i]);
    const sku = cells[0] ?? "";
    const title = cells[1] ?? "";
    const priceStroops = (cells[2] ?? "").trim();
    const stockRaw = (cells[3] ?? "").trim();
    const stock = /^-?\d+$/.test(stockRaw) ? Number(stockRaw) : Number.NaN;
    parsedProducts.push(
      revalidateCsvImportRow({
        rowNumber: i + 1,
        sku,
        title,
        priceStroops,
        stock,
        errors: [],
        isValid: false,
      })
    );
  }
  return summarizeCsvImport(parsedProducts);
}
