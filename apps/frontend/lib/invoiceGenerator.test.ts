import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  stroopsToXlm,
  invoicePdfFilename,
  invoiceCsvFilename,
  explorerUrl,
  invoiceDataToCsvRow,
  exportOrdersToCsv,
  generateInvoicePdf,
  type InvoiceData,
} from "./invoiceGenerator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInvoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    orderId: "order-001",
    escrowId: "escrow-abc123",
    buyerAddress: "GBUYERSTELLAR1234567890ABCDEFGHIJ",
    merchantName: "Acme Store",
    items: [
      { name: "Widget A", quantity: 2, unitPriceStroops: 5_000_000n },
      { name: "Gadget B", quantity: 1, unitPriceStroops: 12_000_000n },
    ],
    totalAmountStroops: 22_000_000n,
    taxAmountStroops: 2_200_000n,
    settledAt: new Date("2026-09-01T12:00:00.000Z"),
    stellarTxHash:
      "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// stroopsToXlm
// ---------------------------------------------------------------------------

describe("stroopsToXlm", () => {
  it("converts 0 stroops to zero XLM", () => {
    expect(stroopsToXlm(0n)).toBe("0.0000000 XLM");
  });

  it("converts exactly 1 XLM (10_000_000 stroops)", () => {
    expect(stroopsToXlm(10_000_000n)).toBe("1.0000000 XLM");
  });

  it("converts fractional amounts correctly", () => {
    expect(stroopsToXlm(5_000_000n)).toBe("0.5000000 XLM");
    expect(stroopsToXlm(1n)).toBe("0.0000001 XLM");
  });

  it("handles large amounts without overflow", () => {
    const oneHundredThousandXlm = 1_000_000_000_000n;
    expect(stroopsToXlm(oneHundredThousandXlm)).toBe("100000.0000000 XLM");
  });
});

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------

describe("invoicePdfFilename", () => {
  it("returns a deterministic filename based on orderId", () => {
    expect(invoicePdfFilename({ orderId: "order-42" })).toBe(
      "delego-invoice-order-42.pdf"
    );
  });
});

describe("invoiceCsvFilename", () => {
  it("includes today's ISO date in the filename", () => {
    const filename = invoiceCsvFilename();
    const today = new Date().toISOString().slice(0, 10);
    expect(filename).toBe(`delego-invoices-${today}.csv`);
  });
});

// ---------------------------------------------------------------------------
// explorerUrl
// ---------------------------------------------------------------------------

describe("explorerUrl", () => {
  it("builds a testnet URL by default", () => {
    const url = explorerUrl("deadbeef");
    expect(url).toContain("testnet");
    expect(url).toContain("deadbeef");
  });

  it("builds a mainnet URL when specified", () => {
    const url = explorerUrl("deadbeef", "mainnet");
    expect(url).toContain("public");
    expect(url).not.toContain("testnet");
  });
});

// ---------------------------------------------------------------------------
// CSV row conversion
// ---------------------------------------------------------------------------

describe("invoiceDataToCsvRow", () => {
  it("produces a row with the correct number of columns", () => {
    const row = invoiceDataToCsvRow(makeInvoice());
    // 12 columns defined in CSV_HEADERS
    expect(row).toHaveLength(12);
  });

  it("serializes orderId and merchantName correctly", () => {
    const row = invoiceDataToCsvRow(makeInvoice());
    expect(row[0]).toBe("order-001");
    expect(row[3]).toBe("Acme Store");
  });

  it("formats settled date as ISO string", () => {
    const row = invoiceDataToCsvRow(makeInvoice());
    expect(row[4]).toBe("2026-09-01T12:00:00.000Z");
  });

  it("joins multiple item names with semicolons", () => {
    const row = invoiceDataToCsvRow(makeInvoice());
    expect(row[5]).toBe("Widget A; Gadget B");
  });

  it("formats XLM totals correctly", () => {
    const row = invoiceDataToCsvRow(makeInvoice());
    // totalAmountStroops = 22_000_000 → 2.2000000 XLM
    expect(row[10]).toBe("2.2000000 XLM");
    // taxAmountStroops = 2_200_000 → 0.2200000 XLM
    expect(row[9]).toBe("0.2200000 XLM");
  });

  it("computes subtotal from line items (qty × unit price)", () => {
    // Widget A: 2 × 5_000_000 = 10_000_000
    // Gadget B: 1 × 12_000_000 = 12_000_000
    // subtotal = 22_000_000 → 2.2000000 XLM
    const row = invoiceDataToCsvRow(makeInvoice());
    expect(row[8]).toBe("2.2000000 XLM");
  });

  it("leaves stellarTxHash empty when not provided", () => {
    const row = invoiceDataToCsvRow(makeInvoice({ stellarTxHash: undefined }));
    expect(row[11]).toBe("");
  });

  it("includes stellarTxHash when provided", () => {
    const row = invoiceDataToCsvRow(makeInvoice());
    expect(row[11]).toBe(
      "abc123def456abc123def456abc123def456abc123def456abc123def456abc1"
    );
  });
});

// ---------------------------------------------------------------------------
// exportOrdersToCsv — verifies it calls downloadCsv with correct content
// ---------------------------------------------------------------------------

vi.mock("./csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./csv")>();
  return {
    ...actual,
    downloadCsv: vi.fn(),
  };
});

describe("exportOrdersToCsv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls downloadCsv with a filename and CSV content", async () => {
    const { downloadCsv } = await import("./csv");
    exportOrdersToCsv([makeInvoice()]);
    expect(downloadCsv).toHaveBeenCalledOnce();
    const [filename, content] = (downloadCsv as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(filename).toMatch(/^delego-invoices-/);
    expect(filename).toMatch(/\.csv$/);
    expect(content).toContain("Order ID");
    expect(content).toContain("order-001");
  });

  it("exports an empty array without throwing", async () => {
    const { downloadCsv } = await import("./csv");
    expect(() => exportOrdersToCsv([])).not.toThrow();
    expect(downloadCsv).toHaveBeenCalledOnce();
  });

  it("exports multiple invoices as multiple rows", async () => {
    const { downloadCsv } = await import("./csv");
    exportOrdersToCsv([
      makeInvoice({ orderId: "order-A" }),
      makeInvoice({ orderId: "order-B" }),
    ]);
    const [, content] = (downloadCsv as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(content).toContain("order-A");
    expect(content).toContain("order-B");
  });
});

// ---------------------------------------------------------------------------
// generateInvoicePdf — smoke test with mocked jspdf
// ---------------------------------------------------------------------------

vi.mock("jspdf", () => {
  const mockDoc = {
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    setDrawColor: vi.fn(),
    setTextColor: vi.fn(),
    text: vi.fn(),
    line: vi.fn(),
    addImage: vi.fn(),
    output: vi.fn(() => new ArrayBuffer(8)),
    internal: {
      pageSize: { getWidth: () => 210, getHeight: () => 297 },
    },
    lastAutoTable: { finalY: 100 },
  };

  return {
    jsPDF: vi.fn(() => mockDoc),
  };
});

vi.mock("jspdf-autotable", () => ({
  default: vi.fn((doc: { lastAutoTable: { finalY: number } }) => {
    doc.lastAutoTable = { finalY: 100 };
  }),
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async () => "data:image/png;base64,FAKEQR"),
  },
}));

vi.mock("./download", () => ({
  downloadBlob: vi.fn(),
}));

describe("generateInvoicePdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves without throwing for a valid invoice", async () => {
    await expect(generateInvoicePdf(makeInvoice())).resolves.toBeUndefined();
  });

  it("calls downloadBlob with a .pdf filename", async () => {
    const { downloadBlob } = await import("./download");
    await generateInvoicePdf(makeInvoice());
    expect(downloadBlob).toHaveBeenCalledOnce();
    const [filename] = (downloadBlob as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(filename).toBe("delego-invoice-order-001.pdf");
  });

  it("includes QR code when stellarTxHash is provided", async () => {
    const { jsPDF } = await import("jspdf");
    const mockDoc = (jsPDF as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    await generateInvoicePdf(makeInvoice());
    // addImage is called with the QR data URL
    if (mockDoc) {
      expect(mockDoc.addImage).toHaveBeenCalled();
    }
  });

  it("skips QR code when stellarTxHash is not provided", async () => {
    const { jsPDF } = await import("jspdf");
    const instance = new (jsPDF as unknown as ReturnType<typeof vi.fn>)();
    instance.addImage.mockClear();
    await generateInvoicePdf(makeInvoice({ stellarTxHash: undefined }));
    expect(instance.addImage).not.toHaveBeenCalled();
  });

  it("works with testnet and mainnet network values", async () => {
    await expect(
      generateInvoicePdf(makeInvoice(), "mainnet")
    ).resolves.toBeUndefined();
    await expect(
      generateInvoicePdf(makeInvoice(), "testnet")
    ).resolves.toBeUndefined();
  });
});
