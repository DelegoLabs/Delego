import { describe, expect, it } from "vitest";
import {
  buildSampleCatalogCsv,
  chunkCsvImportRows,
  collectCsvImportCellErrors,
  parseCsvCatalogImport,
  revalidateCsvImportRow,
  type CsvImportRow,
} from "./csvCatalogImport";

const HEADER = "sku,title,priceStroops,stock";

describe("parseCsvCatalogImport (#909)", () => {
  it("keeps invalid rows in the preview with messages", () => {
    const summary = parseCsvCatalogImport(
      [HEADER, "SKU-1,Mug,1500000,4", ",Missing,nope,-1", 'SKU-2,"Bowl, Large",900000,2'].join("\n")
    );
    expect(summary.totalRows).toBe(3);
    expect(summary.validRows).toBe(2);
    expect(summary.errorRows).toBe(1);
    expect(summary.parsedProducts[1].isValid).toBe(false);
    expect(summary.parsedProducts[1].errors.join(" ")).toMatch(/sku is required/);
    expect(summary.parsedProducts[2].title).toBe("Bowl, Large");
  });

  it("rejects the wrong header and an empty file", () => {
    expect(() => parseCsvCatalogImport("")).toThrow(/empty/);
    expect(() => parseCsvCatalogImport("name,cost\nMug,5")).toThrow(/Header must be/);
  });

  it("revalidates an edited row and chunks submissions", () => {
    const broken = parseCsvCatalogImport([HEADER, ",Mug,1500000,1"].join("\n")).parsedProducts[0];
    const fixed: CsvImportRow = revalidateCsvImportRow({ ...broken, sku: "SKU-9" });
    expect(fixed.isValid).toBe(true);
    const batches = chunkCsvImportRows([1, 2, 3], 2);
    expect(batches).toEqual([[1, 2], [3]]);
  });

  it("builds a valid sample CSV template", () => {
    const sample = buildSampleCatalogCsv();
    const summary = parseCsvCatalogImport(sample);
    expect(summary.totalRows).toBeGreaterThanOrEqual(2);
    expect(summary.errorRows).toBe(0);
    expect(summary.validRows).toBe(summary.totalRows);
  });

  it("collects structured row and column validation errors", () => {
    const summary = parseCsvCatalogImport(
      [HEADER, "SKU-1,Mug,1500000,4", ",Missing,nope,-1"].join("\n")
    );
    const cellErrors = collectCsvImportCellErrors(summary.parsedProducts);
    expect(cellErrors).toEqual([
      { rowNumber: 3, column: "sku", message: "sku is required." },
      { rowNumber: 3, column: "priceStroops", message: "priceStroops must be a whole number of stroops." },
      { rowNumber: 3, column: "stock", message: "stock must be a non-negative whole number." },
    ]);
  });
});
