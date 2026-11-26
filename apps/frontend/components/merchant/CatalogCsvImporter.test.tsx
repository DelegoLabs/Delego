import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  CSV_IMPORT_MAX_BYTES,
  CSV_IMPORT_SAMPLE_FILENAME,
  parseCsvCatalogImport,
} from "../../lib/csvCatalogImport";
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

  it("downloads a sample CSV template when clicking Download sample CSV", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => "blob:sample-csv");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    try {
      render(<CatalogCsvImporter onImport={vi.fn()} parseCsv={async (text) => parseCsvCatalogImport(text)} />);

      await user.click(screen.getByTestId("catalog-csv-download-sample"));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:sample-csv");
      const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
      expect(anchor.download).toBe(CSV_IMPORT_SAMPLE_FILENAME);
    } finally {
      clickSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("shows a structured row/column error table before submission and updates as cells are fixed", async () => {
    const user = userEvent.setup();
    render(<CatalogCsvImporter onImport={vi.fn()} parseCsv={async (text) => parseCsvCatalogImport(text)} />);

    const csv = [HEADER, "SKU-1,Mug,1500000,4", ",Cup,bad,-2"].join("\n");
    const file = new File([csv], "errors.csv", { type: "text/csv" });
    await user.upload(screen.getByTestId("catalog-csv-input"), file);

    const errorTable = await screen.findByTestId("catalog-csv-error-table");
    const skuErr = within(errorTable).getByTestId("catalog-csv-error-row-3-sku");
    const priceErr = within(errorTable).getByTestId("catalog-csv-error-row-3-priceStroops");
    const stockErr = within(errorTable).getByTestId("catalog-csv-error-row-3-stock");

    expect(skuErr).toHaveTextContent("3");
    expect(skuErr).toHaveTextContent("sku");
    expect(skuErr).toHaveTextContent("sku is required.");
    expect(priceErr).toHaveTextContent("priceStroops");
    expect(stockErr).toHaveTextContent("stock");

    await user.type(screen.getByLabelText("sku row 3"), "SKU-2");
    await waitFor(() =>
      expect(screen.queryByTestId("catalog-csv-error-row-3-sku")).not.toBeInTheDocument()
    );
    expect(screen.getByTestId("catalog-csv-error-row-3-priceStroops")).toBeInTheDocument();
  });
});
