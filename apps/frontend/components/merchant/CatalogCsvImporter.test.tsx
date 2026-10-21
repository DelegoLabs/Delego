import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CSV_IMPORT_MAX_BYTES, parseCsvCatalogImport } from "../../lib/csvCatalogImport";
import { CatalogCsvImporter } from "./CatalogCsvImporter";

const HEADER = "sku,title,priceStroops,stock";

describe("CatalogCsvImporter (#909)", () => {
  it("highlights invalid rows, accepts an inline fix, and submits valid rows in batches", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn(async (rows: Array<{ sku: string; isValid: boolean }>) => {
      void rows;
    });
    render(<CatalogCsvImporter onImport={onImport} parseCsv={async (text) => parseCsvCatalogImport(text)} />);

    const csv = [HEADER, "SKU-1,Mug,1500000,4", ",Cup,1500000,1"].join("\n");
    const file = new File([csv], "catalog.csv", { type: "text/csv" });
    await user.upload(screen.getByTestId("catalog-csv-input"), file);

    const invalid = await screen.findByTestId("catalog-csv-row-3");
    expect(invalid).toHaveAttribute("data-valid", "false");
    expect(invalid).toHaveAttribute("title", expect.stringContaining("sku is required"));
    expect(screen.getByTestId("catalog-csv-summary")).toHaveTextContent("1 valid, 1 invalid");

    await user.type(screen.getByLabelText("sku row 3"), "SKU-2");
    await waitFor(() => expect(screen.getByTestId("catalog-csv-row-3")).toHaveAttribute("data-valid", "true"));

    await user.click(screen.getByTestId("catalog-csv-submit"));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport.mock.calls.length).toBeGreaterThan(0);
    const firstArg = onImport.mock.calls[0]?.[0] as Array<{ sku: string; isValid: boolean }> | undefined;
    expect(firstArg).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sku: "SKU-1", isValid: true }),
        expect.objectContaining({ sku: "SKU-2", isValid: true }),
      ])
    );
  });

  it("rejects a file over 5MB before parsing", async () => {
    const user = userEvent.setup();
    const parseCsv = vi.fn();
    render(<CatalogCsvImporter onImport={vi.fn()} parseCsv={parseCsv} />);

    const file = new File(["sku,title,priceStroops,stock\n"], "big.csv", { type: "text/csv" });
    Object.defineProperty(file, "size", { value: CSV_IMPORT_MAX_BYTES + 1 });
    await user.upload(screen.getByTestId("catalog-csv-input"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent("5MB");
    expect(parseCsv).not.toHaveBeenCalled();
  });

  it("accepts a dropped file", async () => {
    render(
      <CatalogCsvImporter
        onImport={vi.fn()}
        parseCsv={async (text) => parseCsvCatalogImport(text)}
      />
    );
    const file = new File([`${HEADER}\nSKU-1,Mug,1500000,1`], "drop.csv", { type: "text/csv" });
    const zone = screen.getByLabelText("Bulk catalog import").firstElementChild as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(await screen.findByTestId("catalog-csv-summary")).toHaveTextContent("1 valid");
  });
});
