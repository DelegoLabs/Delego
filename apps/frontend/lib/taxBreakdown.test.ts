import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAX_RATES,
  NON_TAXABLE_CATEGORIES,
  computeTaxBreakdown,
  formatTaxRate,
  isNonTaxableCategory,
  isZeroRated,
  resolveJurisdictionLabel,
  resolveTaxRatePercent,
  sumTaxAmounts,
  taxStroopsToAmountString,
} from "./taxBreakdown";

const XLM = 10_000_000n;

// ─── Non-taxable digital goods (#723 acceptance criterion) ──────────────────

describe("isNonTaxableCategory", () => {
  it("treats digital goods as non-taxable regardless of casing or padding", () => {
    expect(isNonTaxableCategory("digital")).toBe(true);
    expect(isNonTaxableCategory("  Digital  ")).toBe(true);
    expect(isNonTaxableCategory("software")).toBe(true);
    expect(isNonTaxableCategory("DIGITAL GOODS")).toBe(true);
  });

  it("does not treat physical goods as non-taxable", () => {
    expect(isNonTaxableCategory("electronics")).toBe(false);
    expect(isNonTaxableCategory("clothing")).toBe(false);
  });

  it("treats an absent category as unknown rather than non-taxable", () => {
    expect(isNonTaxableCategory(undefined)).toBe(false);
    expect(isNonTaxableCategory(null)).toBe(false);
    expect(isNonTaxableCategory("")).toBe(false);
  });

  it("lists at least one non-taxable category", () => {
    expect(NON_TAXABLE_CATEGORIES.length).toBeGreaterThan(0);
  });
});

describe("resolveTaxRatePercent", () => {
  it("returns 0% for non-taxable digital goods in a taxable jurisdiction", () => {
    // The key acceptance criterion: a digital download must not pick up VAT.
    expect(resolveTaxRatePercent("digital", "EU")).toBe(0);
    expect(resolveTaxRatePercent("software", "GB")).toBe(0);
  });

  it("returns the jurisdiction default for taxable goods", () => {
    expect(resolveTaxRatePercent("electronics", "EU")).toBe(20);
    expect(resolveTaxRatePercent("electronics", "us-ca")).toBe(7.25);
  });

  it("returns 0% for an unknown jurisdiction rather than guessing", () => {
    expect(resolveTaxRatePercent("electronics", "ZZ")).toBe(0);
    expect(resolveTaxRatePercent("electronics", undefined)).toBe(0);
  });

  it("is case- and whitespace-insensitive on the jurisdiction code", () => {
    expect(resolveTaxRatePercent("electronics", " us-ny ")).toBe(4);
  });
});

describe("resolveJurisdictionLabel", () => {
  it("labels non-taxable digital goods explicitly", () => {
    expect(resolveJurisdictionLabel("digital", "EU")).toBe(
      "Non-taxable digital goods"
    );
  });

  it("labels a known jurisdiction", () => {
    expect(resolveJurisdictionLabel("electronics", "EU")).toBe("EU VAT");
  });

  it("falls back to a not-applicable label for an unknown jurisdiction", () => {
    expect(resolveJurisdictionLabel("electronics", "ZZ")).toBe(
      "Tax not applicable"
    );
  });
});

describe("formatTaxRate", () => {
  it("drops a trailing .0 but keeps real decimals", () => {
    expect(formatTaxRate(20)).toBe("20%");
    expect(formatTaxRate(7.25)).toBe("7.25%");
    expect(formatTaxRate(0)).toBe("0%");
  });
});

// ─── Computation ─────────────────────────────────────────────────────────────

describe("computeTaxBreakdown", () => {
  it("computes subtotal, tax, and total for a taxable order", () => {
    const breakdown = computeTaxBreakdown({
      subtotalStroops: 100n * XLM,
      category: "electronics",
      jurisdictionCode: "EU",
    });

    expect(breakdown).toEqual({
      subtotalStroops: (100n * XLM).toString(),
      taxRatePercent: 20,
      taxAmountStroops: (20n * XLM).toString(),
      jurisdiction: "EU VAT",
      totalStroops: (120n * XLM).toString(),
    });
  });

  it("shows 0% tax for non-taxable digital goods", () => {
    const breakdown = computeTaxBreakdown({
      subtotalStroops: 100n * XLM,
      category: "digital",
      jurisdictionCode: "EU",
    });

    expect(breakdown.taxRatePercent).toBe(0);
    expect(breakdown.taxAmountStroops).toBe("0");
    expect(breakdown.totalStroops).toBe(breakdown.subtotalStroops);
    expect(breakdown.jurisdiction).toBe("Non-taxable digital goods");
    expect(isZeroRated(breakdown)).toBe(true);
  });

  it("excludes the network fee from the taxable base", () => {
    const withFee = computeTaxBreakdown({
      subtotalStroops: 100n * XLM,
      networkFeeStroops: 5n * XLM,
      category: "electronics",
      jurisdictionCode: "EU",
    });
    const withoutFee = computeTaxBreakdown({
      subtotalStroops: 100n * XLM,
      category: "electronics",
      jurisdictionCode: "EU",
    });

    // 20% of 100 XLM, not of 105 XLM.
    expect(withFee.taxAmountStroops).toBe("200000000");
    expect(withFee.taxAmountStroops).toBe(withoutFee.taxAmountStroops);
    expect(withFee.totalStroops).toBe(withoutFee.totalStroops);
  });

  it("rounds tax half-up to the nearest stroop", () => {
    // 7.5% of 10_000_001 = 750_000.075 -> 750_000
    expect(
      computeTaxBreakdown({ subtotalStroops: 10_000_001n, taxRatePercent: 7.5 })
        .taxAmountStroops
    ).toBe("750000");
    // 7.5% of 10_000_003 = 750_000.225 -> 750_000
    expect(
      computeTaxBreakdown({ subtotalStroops: 10_000_003n, taxRatePercent: 7.5 })
        .taxAmountStroops
    ).toBe("750000");
    // 7.5% of 10_000_007 = 750_000.525 -> 750_001
    expect(
      computeTaxBreakdown({ subtotalStroops: 10_000_007n, taxRatePercent: 7.5 })
        .taxAmountStroops
    ).toBe("750001");
  });

  it("honours an explicit rate override", () => {
    const breakdown = computeTaxBreakdown({
      subtotalStroops: 100n * XLM,
      category: "electronics",
      jurisdictionCode: "EU",
      taxRatePercent: 0,
    });
    expect(breakdown.taxRatePercent).toBe(0);
    expect(breakdown.taxAmountStroops).toBe("0");
  });

  it("treats a malformed or missing subtotal as zero rather than NaN", () => {
    for (const subtotal of [undefined, null, "abc", ""]) {
      const breakdown = computeTaxBreakdown({
        subtotalStroops: subtotal as never,
        category: "electronics",
        jurisdictionCode: "EU",
      });
      expect(breakdown.subtotalStroops).toBe("0");
      expect(breakdown.taxAmountStroops).toBe("0");
      expect(breakdown.totalStroops).toBe("0");
    }
  });

  it("accepts a numeric string subtotal", () => {
    expect(
      computeTaxBreakdown({ subtotalStroops: "10000000", taxRatePercent: 10 })
        .taxAmountStroops
    ).toBe("1000000");
  });

  it("is not zero-rated for a taxable order", () => {
    const breakdown = computeTaxBreakdown({
      subtotalStroops: 100n * XLM,
      category: "electronics",
      jurisdictionCode: "EU",
    });
    expect(isZeroRated(breakdown)).toBe(false);
  });
});

describe("sumTaxAmounts", () => {
  it("totals the tax across a set of breakdowns", () => {
    const a = computeTaxBreakdown({ subtotalStroops: 10n * XLM, taxRatePercent: 20 });
    const b = computeTaxBreakdown({ subtotalStroops: 5n * XLM, taxRatePercent: 10 });
    // 2 XLM + 0.5 XLM = 25_000_000 stroops
    expect(sumTaxAmounts([a, b])).toBe(25_000_000n);
  });

  it("returns zero for an empty list", () => {
    expect(sumTaxAmounts([])).toBe(0n);
  });
});

describe("taxStroopsToAmountString", () => {
  it("renders an XLM amount without rounding", () => {
    expect(taxStroopsToAmountString("25000000")).toBe("2.5");
    expect(taxStroopsToAmountString("0")).toBe("0");
    expect(taxStroopsToAmountString("1")).toBe("0.0000001");
  });
});

describe("DEFAULT_TAX_RATES", () => {
  it("keeps every listed rate a valid, non-negative percentage", () => {
    for (const [code, entry] of Object.entries(DEFAULT_TAX_RATES)) {
      expect(entry.label, code).toBeTruthy();
      expect(entry.bps, code).toBeGreaterThanOrEqual(0);
      expect(resolveTaxRatePercent("electronics", code)).toBeGreaterThanOrEqual(0);
    }
  });
});
