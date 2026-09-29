import { describe, expect, it, vi } from "vitest";
import {
  EXPORT_COLUMNS,
  EXPORT_COLUMN_LABELS,
  buildExpenseReport,
  buildExpenseReportCsv,
  buildExpenseReportJson,
  cellValue,
  defaultExportReportConfig,
  downloadExpenseReport,
  expenseReportFilename,
  isWithinDateRange,
  normalizeColumns,
  parseStroops,
  sanitizeCsvCell,
  selectReportableOrders,
  stroopsToXlm,
  toDayKey,
  toReportRows,
  validateExportConfig,
  type ExportableOrder,
  type ExportReportConfig,
} from "./expenseReport";

function order(overrides: Partial<ExportableOrder> = {}): ExportableOrder {
  return {
    id: "order-1",
    escrowId: "escrow-1",
    merchantId: "merchant-1",
    category: "electronics",
    totalStroops: 25_000_000n,
    txHash: "abc123",
    createdAt: "2026-02-10T12:00:00.000Z",
    ...overrides,
  };
}

function config(
  overrides: Partial<ExportReportConfig> = {}
): ExportReportConfig {
  return {
    startDate: "2026-02-01",
    endDate: "2026-02-28",
    format: "csv",
    columns: [...EXPORT_COLUMNS],
    ...overrides,
  };
}

// ─── CSV formula-injection sanitisation (#722 acceptance criterion) ──────────

describe("sanitizeCsvCell", () => {
  it("neutralises a leading '=' so a merchant cannot smuggle in a formula", () => {
    expect(sanitizeCsvCell("=1+1")).toBe("'=1+1");
  });

  it("neutralises the other formula prefixes Excel recognises", () => {
    expect(sanitizeCsvCell("+SUM(A1:A9)")).toBe("'+SUM(A1:A9)");
    expect(sanitizeCsvCell("-2+3")).toBe("'-2+3");
    expect(sanitizeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("strips leading tabs and carriage returns that precede a formula", () => {
    expect(sanitizeCsvCell("\t=cmd|'/c calc'!A0")).toBe("'=cmd|'/c calc'!A0");
    expect(sanitizeCsvCell("\r@evil")).toBe("'@evil");
  });

  it("leaves ordinary values untouched so reports stay readable", () => {
    expect(sanitizeCsvCell("merchant-1")).toBe("merchant-1");
    expect(sanitizeCsvCell("12.5")).toBe("12.5");
    expect(sanitizeCsvCell("")).toBe("");
  });

  it("leaves RFC 4180 quoting to toCsv — commas and quotes are not injection", () => {
    expect(sanitizeCsvCell("Acme, Inc.")).toBe("Acme, Inc.");
    expect(sanitizeCsvCell('say "hi"')).toBe('say "hi"');
    expect(sanitizeCsvCell("line1\nline2")).toBe("line1\nline2");
  });

  it("only neutralises a dangerous character in leading position", () => {
    expect(sanitizeCsvCell("a=b")).toBe("a=b");
    expect(sanitizeCsvCell("total=100")).toBe("total=100");
  });
});

// ─── Strobe helpers ──────────────────────────────────────────────────────────

describe("stroopsToXlm", () => {
  it("converts whole XLM without a decimal part", () => {
    expect(stroopsToXlm(25_000_000n)).toBe("2.5");
    expect(stroopsToXlm(10_000_000n)).toBe("1");
    expect(stroopsToXlm(0n)).toBe("0");
  });

  it("keeps the smallest representable amount (one stroop)", () => {
    expect(stroopsToXlm(1n)).toBe("0.0000001");
  });

  it("trims trailing zeros but never rounds", () => {
    expect(stroopsToXlm(12_340_000n)).toBe("1.234");
    expect(stroopsToXlm(1_000_001n)).toBe("0.1000001");
  });

  it("accepts a numeric string", () => {
    expect(stroopsToXlm("10000000")).toBe("1");
  });
});

describe("parseStroops", () => {
  it("returns null for anything that is not a non-negative integer", () => {
    expect(parseStroops(null)).toBeNull();
    expect(parseStroops(undefined)).toBeNull();
    expect(parseStroops("12.5")).toBeNull();
    expect(parseStroops("-1")).toBeNull();
    expect(parseStroops("abc")).toBeNull();
  });

  it("accepts bigint, numeric string, and number", () => {
    expect(parseStroops(5n)).toBe(5n);
    expect(parseStroops("5")).toBe(5n);
    expect(parseStroops(5)).toBe(5n);
  });
});

describe("toDayKey", () => {
  it("formats a date as a UTC day key", () => {
    expect(toDayKey("2026-02-10T23:59:59.000Z")).toBe("2026-02-10");
    expect(toDayKey(new Date("2026-02-10T00:00:00.000Z"))).toBe("2026-02-10");
  });

  it("returns an empty string for an unparseable value", () => {
    expect(toDayKey("not-a-date")).toBe("");
  });
});

// ─── Config validation ───────────────────────────────────────────────────────

describe("validateExportConfig", () => {
  it("accepts a well-formed config", () => {
    expect(validateExportConfig(config())).toBeNull();
  });

  it("rejects a missing or malformed date", () => {
    expect(validateExportConfig(config({ startDate: "" }))).toMatch(/valid start and end date/i);
    expect(validateExportConfig(config({ endDate: "2026-13-40" }))).toMatch(/valid start and end date/i);
  });

  it("rejects an inverted date range", () => {
    expect(
      validateExportConfig(config({ startDate: "2026-03-01", endDate: "2026-02-01" }))
    ).toMatch(/start date must be on or before/i);
  });

  it("rejects a config with no columns selected", () => {
    expect(validateExportConfig(config({ columns: [] }))).toMatch(
      /at least one column/i
    );
  });

  it("default config is valid and covers the trailing year", () => {
    const defaults = defaultExportReportConfig();
    expect(validateExportConfig(defaults)).toBeNull();
    expect(defaults.format).toBe("csv");
    expect(defaults.columns).toEqual(EXPORT_COLUMNS);
  });
});

// ─── Row selection ───────────────────────────────────────────────────────────

describe("isWithinDateRange", () => {
  const range = { startDate: "2026-02-01", endDate: "2026-02-28" };

  it("includes both boundary days", () => {
    expect(
      isWithinDateRange(order({ createdAt: "2026-02-01T00:00:00.000Z" }), range)
    ).toBe(true);
    expect(
      isWithinDateRange(order({ createdAt: "2026-02-28T23:59:59.000Z" }), range)
    ).toBe(true);
  });

  it("excludes days outside the range", () => {
    expect(
      isWithinDateRange(order({ createdAt: "2026-01-31T23:59:59.000Z" }), range)
    ).toBe(false);
    expect(
      isWithinDateRange(order({ createdAt: "2026-03-01T00:00:00.000Z" }), range)
    ).toBe(false);
  });

  it("excludes an order with an unparseable date", () => {
    expect(isWithinDateRange(order({ createdAt: "nope" }), range)).toBe(false);
  });
});

describe("selectReportableOrders", () => {
  const orders = [
    order({ id: "a", createdAt: "2026-02-05T00:00:00.000Z", category: "digital" }),
    order({ id: "b", createdAt: "2026-02-10T00:00:00.000Z", category: "electronics" }),
    order({ id: "c", createdAt: "2026-01-10T00:00:00.000Z", category: "electronics" }),
  ];

  it("filters by date range and preserves input order", () => {
    expect(selectReportableOrders(orders, config()).map((o) => o.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("applies a category filter case-insensitively", () => {
    expect(
      selectReportableOrders(orders, config({ filterCategory: "  ELECTRONICS " })).map(
        (o) => o.id
      )
    ).toEqual(["b"]);
  });

  it("treats an empty category filter as 'all'", () => {
    expect(
      selectReportableOrders(orders, config({ filterCategory: "   " })).map((o) => o.id)
    ).toEqual(["a", "b"]);
  });
});

// ─── Cell values and column ordering ─────────────────────────────────────────

describe("cellValue", () => {
  it("renders the amount as an exact XLM string", () => {
    expect(cellValue(order({ totalStroops: 12_340_000n }), "amount")).toBe("1.234");
  });

  it("renders an empty amount for a missing or malformed total", () => {
    expect(cellValue(order({ totalStroops: null }), "amount")).toBe("");
    expect(cellValue(order({ totalStroops: "abc" }), "amount")).toBe("");
  });

  it("renders the date as a full ISO-8601 timestamp", () => {
    expect(cellValue(order(), "date")).toBe("2026-02-10T12:00:00.000Z");
  });

  it("renders empty strings for absent optional fields", () => {
    expect(cellValue(order({ escrowId: null }), "escrowId")).toBe("");
    expect(cellValue(order({ txHash: undefined }), "txHash")).toBe("");
    expect(cellValue(order({ category: null }), "category")).toBe("");
  });
});

describe("normalizeColumns", () => {
  it("de-duplicates repeats", () => {
    expect(normalizeColumns(["amount", "amount", "orderId"])).toEqual([
      "orderId",
      "amount",
    ]);
  });

  it("re-orders to the canonical column order regardless of toggle order", () => {
    expect(normalizeColumns(["txHash", "date", "orderId"])).toEqual([
      "orderId",
      "date",
      "txHash",
    ]);
  });

  it("drops unknown column names", () => {
    expect(
      normalizeColumns(["orderId", "nope" as never])
    ).toEqual(["orderId"]);
  });
});

describe("toReportRows", () => {
  it("emits values in canonical column order and sanitizes each cell", () => {
    const rows = toReportRows([order({ merchantId: "=HYPERLINK(\"http://evil\")" })], [
      "merchant",
      "orderId",
    ]);
    // Canonical order is orderId, merchant — not the order the checkboxes were
    // toggled in — so the header always lines up with the values.
    expect(rows).toEqual([["order-1", "'=HYPERLINK(\"http://evil\")"]]);
  });
});

// ─── Serialisation ───────────────────────────────────────────────────────────

describe("buildExpenseReportCsv", () => {
  it("writes a labelled header and CRLF-delimited rows", () => {
    const rows = toReportRows([order()], ["orderId", "amount"]);
    const csv = buildExpenseReportCsv(rows, ["orderId", "amount"]);
    const [header, first] = csv.split("\r\n");
    expect(header).toBe("Order ID,Amount (XLM)");
    expect(first).toBe("order-1,2.5");
  });

  it("produces a header-only file when nothing matches the filters", () => {
    const csv = buildExpenseReportCsv([], ["orderId"]);
    expect(csv).toBe("Order ID");
  });
});

describe("buildExpenseReportJson", () => {
  it("emits an envelope with the config, labels, and key/value rows", () => {
    const rows = toReportRows([order()], ["orderId", "amount"]);
    const parsed = JSON.parse(buildExpenseReportJson(rows, config({ columns: ["orderId", "amount"] })));

    expect(parsed.rowCount).toBe(1);
    expect(parsed.columnLabels).toEqual(["Order ID", "Amount (XLM)"]);
    expect(parsed.config.columns).toEqual(["orderId", "amount"]);
    expect(parsed.rows[0]).toEqual({ orderId: "order-1", amount: "2.5" });
    expect(typeof parsed.generatedAt).toBe("string");
  });

  it("keeps sanitized cell text in JSON too", () => {
    const rows = toReportRows([order({ merchantId: "=1+1" })], ["merchant"]);
    const parsed = JSON.parse(buildExpenseReportJson(rows, config({ columns: ["merchant"] })));
    expect(parsed.rows[0].merchant).toBe("'=1+1");
  });
});

describe("expenseReportFilename", () => {
  it("encodes the range and the format", () => {
    expect(expenseReportFilename(config())).toBe(
      "delego-expenses-2026-02-01-to-2026-02-28.csv"
    );
    expect(expenseReportFilename(config({ format: "json" }))).toBe(
      "delego-expenses-2026-02-01-to-2026-02-28.json"
    );
  });
});

// ─── End-to-end generation ───────────────────────────────────────────────────

describe("buildExpenseReport", () => {
  const orders = [
    order({ id: "a", createdAt: "2026-02-05T00:00:00.000Z" }),
    order({ id: "b", createdAt: "2026-02-10T00:00:00.000Z", category: "digital" }),
    order({ id: "c", createdAt: "2026-01-10T00:00:00.000Z" }),
  ];

  it("exports only the rows inside the range and reports the count", () => {
    const file = buildExpenseReport(orders, config({ columns: ["orderId"] }));
    expect(file.rowCount).toBe(2);
    expect(file.content).toBe("Order ID\r\na\r\nb");
    expect(file.mimeType).toContain("text/csv");
  });

  it("returns a JSON envelope when the JSON format is chosen", () => {
    const file = buildExpenseReport(
      orders,
      config({ format: "json", columns: ["orderId"] })
    );
    expect(file.mimeType).toBe("application/json");
    expect(JSON.parse(file.content).rows).toHaveLength(2);
  });

  it("sanitizes a hostile merchant name on the way out", () => {
    const file = buildExpenseReport(
      [order({ merchantId: "=cmd|'/c calc'!A0" })],
      config({ columns: ["merchant"] })
    );
    expect(file.content).toContain("'=cmd");
    expect(file.content).not.toContain("\n=cmd");
  });

  it("throws rather than writing a malformed file", () => {
    expect(() => buildExpenseReport(orders, config({ columns: [] }))).toThrow(
      /at least one column/i
    );
    expect(() =>
      buildExpenseReport(orders, config({ startDate: "2026-03-01" }))
    ).toThrow(/start date must be on or before/i);
  });
});

describe("downloadExpenseReport", () => {
  it("hands the file to the browser and returns the generated report", () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const createObjectURL = vi.fn(() => "blob:report");
    const revokeObjectURL = vi.fn((url: string) => revoked.push(url));

    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    // `downloadBlob` appends, clicks, then removes the anchor, so the filename
    // is read off the anchor at click time rather than from a DOM spy.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      created.push(this.download);
    });

    const file = downloadExpenseReport([order()], config({ columns: ["orderId"] }));

    expect(file.filename).toBe("delego-expenses-2026-02-01-to-2026-02-28.csv");
    expect(created).toEqual([file.filename]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
    // The anchor must not be left behind in the document.
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

describe("EXPORT_COLUMN_LABELS", () => {
  it("labels every selectable column", () => {
    for (const column of EXPORT_COLUMNS) {
      expect(EXPORT_COLUMN_LABELS[column]).toBeTruthy();
    }
  });
});
