import { describe, expect, it, vi } from "vitest";
import { jsPDF } from "jspdf";
import { code128Bars, encodeCode128 } from "./code128";
import {
  LABEL_HEIGHT_PT,
  LABEL_WIDTH_PT,
  drawReturnLabel,
  generateReturnLabelPdf,
  normalizeTrackingNumber,
  returnLabelFilename,
  validateReturnLabelConfig,
  type ReturnLabelConfig,
} from "./returnShippingLabel";

const CONFIG: ReturnLabelConfig = {
  orderId: "ord-123",
  buyerAddress: "Ada Buyer, 5 Market St, Abuja 900001",
  merchantHubAddress: "Delego Returns Hub\n12 Warehouse Rd\nLagos 100001",
  trackingNumber: "9400 1000 0000 0000 0000 00",
  carrier: "usps",
};

describe("validateReturnLabelConfig", () => {
  it("accepts a complete config", () => {
    expect(validateReturnLabelConfig(CONFIG)).toEqual({});
  });

  it("flags missing or unusable fields", () => {
    const errors = validateReturnLabelConfig({
      ...CONFIG,
      buyerAddress: " ",
      merchantHubAddress: "Lagos",
      trackingNumber: "ABCé",
      carrier: "ups" as ReturnLabelConfig["carrier"],
    });
    expect(Object.keys(errors).sort()).toEqual(
      ["buyerAddress", "carrier", "merchantHubAddress", "trackingNumber"].sort()
    );
  });
});

describe("helpers", () => {
  it("normalises tracking numbers and builds safe filenames", () => {
    expect(normalizeTrackingNumber(" 1z 999 aa1 ")).toBe("1Z999AA1");
    expect(returnLabelFilename({ ...CONFIG, orderId: "../ord 1" })).toBe(
      "return-label-ord1.pdf"
    );
  });
});

describe("drawReturnLabel", () => {
  it("lays out the carrier mark, hub address, tracking text and every barcode bar", () => {
    const doc = new jsPDF({ unit: "pt", format: [LABEL_WIDTH_PT, LABEL_HEIGHT_PT] });
    const text = vi.spyOn(doc, "text");
    const rect = vi.spyOn(doc, "rect");

    drawReturnLabel(doc, CONFIG);

    const printed = text.mock.calls.map((call) => String(call[0]));
    expect(printed).toEqual(
      expect.arrayContaining([
        "USPS",
        "Delego Returns Hub",
        "12 Warehouse Rd",
        "Lagos 100001",
        "Ada Buyer",
        "9400100000000000000000",
        "Order ord-123",
      ])
    );

    const bars = code128Bars(encodeCode128("9400100000000000000000"));
    // One filled rect for the carrier band plus one per bar.
    expect(rect).toHaveBeenCalledTimes(bars.length + 1);
    // Every bar stays inside the label.
    for (const call of rect.mock.calls.slice(1)) {
      const [x, , w] = call as unknown as [number, number, number];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(LABEL_WIDTH_PT);
    }
  });
});

describe("generateReturnLabelPdf", () => {
  it("produces a PDF blob", async () => {
    const blob = await generateReturnLabelPdf(CONFIG);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("refuses an invalid config", async () => {
    await expect(generateReturnLabelPdf({ ...CONFIG, trackingNumber: "" })).rejects.toThrow(
      /Tracking number/
    );
  });
});
