export const CATALOG_CSV_HEADER = [
  "sku",
  "title",
  "priceStroops",
  "assetCode",
  "stockQuantity",
  "category",
] as const;

export const CATALOG_ASSET_CODES = ["USDC", "XLM", "EURC"] as const;
export type CatalogAssetCode = (typeof CATALOG_ASSET_CODES)[number];

export interface CatalogImportRow {
  sku: string;
  title: string;
  priceStroops: string;
  assetCode: CatalogAssetCode;
  stockQuantity: number;
  category?: string;
}

export interface CatalogRowError {
  row: number;
  message: string;
}

export interface CatalogCsvParseResult {
  rows: CatalogImportRow[];
  errors: CatalogRowError[];
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
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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
  if (buffer !== null && buffer.length > 0) {
    records.push(buffer);
  }
  return records;
}

function isCatalogAssetCode(value: string): value is CatalogAssetCode {
  return (CATALOG_ASSET_CODES as readonly string[]).includes(value);
}

export function parseCatalogCsv(text: string): CatalogCsvParseResult {
  const records = splitCsvRecords(text).filter((line) => line.trim().length > 0);
  const rows: CatalogImportRow[] = [];
  const errors: CatalogRowError[] = [];

  if (records.length === 0) {
    errors.push({ row: 1, message: "The file is empty." });
    return { rows, errors };
  }

  const header = splitCsvLine(records[0]).map((cell) => cell.trim());
  const headerOk =
    header.length >= CATALOG_CSV_HEADER.length &&
    CATALOG_CSV_HEADER.every((expected, index) => header[index]?.toLowerCase() === expected.toLowerCase());
  if (!headerOk) {
    errors.push({
      row: 1,
      message: `Header must start with: ${CATALOG_CSV_HEADER.join(", ")}.`,
    });
    return { rows, errors };
  }

  for (let i = 1; i < records.length; i += 1) {
    const rowNumber = i + 1;
    const cells = splitCsvLine(records[i]);
    const [sku, title, priceStroopsRaw, assetCodeRaw, stockQuantityRaw, category] = cells.map((c) => c.trim());

    if (!sku) {
      errors.push({ row: rowNumber, message: "sku is required." });
      continue;
    }
    if (!title) {
      errors.push({ row: rowNumber, message: "title is required." });
      continue;
    }
    if (!/^\d+$/.test(priceStroopsRaw ?? "")) {
      errors.push({ row: rowNumber, message: "priceStroops must be a whole number of stroops." });
      continue;
    }
    const assetCode = (assetCodeRaw ?? "").toUpperCase();
    if (!isCatalogAssetCode(assetCode)) {
      errors.push({
        row: rowNumber,
        message: `assetCode must be one of: ${CATALOG_ASSET_CODES.join(", ")}.`,
      });
      continue;
    }
    const stockQuantity = Number(stockQuantityRaw);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      errors.push({ row: rowNumber, message: "stockQuantity must be a non-negative whole number." });
      continue;
    }

    rows.push({
      sku,
      title,
      priceStroops: priceStroopsRaw,
      assetCode,
      stockQuantity,
      category: category || undefined,
    });
  }

  return { rows, errors };
}

export function readCatalogCsvFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read the file."));
    reader.readAsText(file);
  });
}
