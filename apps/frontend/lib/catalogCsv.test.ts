import { describe, it, expect } from "vitest";
import { parseCatalogCsv, CATALOG_CSV_HEADER } from "./catalogCsv";

const HEADER_LINE = CATALOG_CSV_HEADER.join(",");

describe("parseCatalogCsv (#791)", () => {
  it("parses well-formed rows", () => {
    const csv = [
      HEADER_LINE,
      "SKU-1,Blue Mug,1500000,USDC,10,Kitchen",
      "SKU-2,Red Mug,2000000,XLM,5,",
    ].join("\n");

    const { rows, errors } = parseCatalogCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { sku: "SKU-1", title: "Blue Mug", priceStroops: "1500000", assetCode: "USDC", stockQuantity: 10, category: "Kitchen" },
      { sku: "SKU-2", title: "Red Mug", priceStroops: "2000000", assetCode: "XLM", stockQuantity: 5, category: undefined },
    ]);
  });

  it("handles a quoted field containing a comma", () => {
    const csv = [HEADER_LINE, 'SKU-1,"Mug, Large",1500000,USDC,10,Kitchen'].join("\n");

    const { rows, errors } = parseCatalogCsv(csv);

    expect(errors).toEqual([]);
    expect(rows[0].title).toBe("Mug, Large");
  });

  it("handles an escaped quote inside a quoted field", () => {
    const csv = [HEADER_LINE, 'SKU-1,"12\\" Mug",1500000,USDC,10,'.replace('\\"', '""')].join("\n");

    const { rows, errors } = parseCatalogCsv(csv);

    expect(errors).toEqual([]);
    expect(rows[0].title).toBe('12" Mug');
  });

  it("rejects an empty file", () => {
    const { rows, errors } = parseCatalogCsv("");
    expect(rows).toEqual([]);
    expect(errors).toEqual([{ row: 1, message: "The file is empty." }]);
  });

  it("rejects a file with the wrong header", () => {
    const csv = ["name,cost", "Mug,5"].join("\n");
    const { rows, errors } = parseCatalogCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(1);
  });

  it("reports a missing sku without discarding other valid rows", () => {
    const csv = [HEADER_LINE, ",Mug,1500000,USDC,10,", "SKU-2,Cup,900000,XLM,3,"].join("\n");
    const { rows, errors } = parseCatalogCsv(csv);
    expect(rows).toEqual([
      { sku: "SKU-2", title: "Cup", priceStroops: "900000", assetCode: "XLM", stockQuantity: 3, category: undefined },
    ]);
    expect(errors).toEqual([{ row: 2, message: "sku is required." }]);
  });

  it("rejects a non-numeric priceStroops", () => {
    const csv = [HEADER_LINE, "SKU-1,Mug,free,USDC,10,"].join("\n");
    const { errors } = parseCatalogCsv(csv);
    expect(errors).toEqual([{ row: 2, message: "priceStroops must be a whole number of stroops." }]);
  });

  it("rejects an unsupported assetCode", () => {
    const csv = [HEADER_LINE, "SKU-1,Mug,1500000,BTC,10,"].join("\n");
    const { errors } = parseCatalogCsv(csv);
    expect(errors[0].message).toContain("USDC, XLM, EURC");
  });

  it("rejects a negative or non-integer stockQuantity", () => {
    const csv = [HEADER_LINE, "SKU-1,Mug,1500000,USDC,-1,", "SKU-2,Cup,900000,XLM,2.5,"].join("\n");
    const { rows, errors } = parseCatalogCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(2);
  });

  it("skips blank lines", () => {
    const csv = [HEADER_LINE, "", "SKU-1,Mug,1500000,USDC,10,", ""].join("\n");
    const { rows, errors } = parseCatalogCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });
});
