/**
 * Unit tests for tax calculation service.
 * Tests postal code normalization, jurisdiction lookup, tax calculation,
 * and edge cases for the automated sales tax and VAT system.
 */

import {
  normalizePostalCode,
  lookupTaxJurisdiction,
  calculateTaxBreakdown,
  formatTaxRate,
  getTaxTypeLabel,
  validateTaxBreakdown,
  hasTaxObligation,
  getSupportedPostalCodes,
  type TaxBreakdown,
} from "./taxCalculation";

describe("taxCalculation", () => {
  describe("normalizePostalCode", () => {
    test("removes spaces and hyphens", () => {
      expect(normalizePostalCode("M5V 3A8")).toBe("M5V3A8");
      expect(normalizePostalCode("90210-1234")).toBe("902101234");
      expect(normalizePostalCode("SW1A 1AA")).toBe("SW1A1AA");
    });

    test("converts to uppercase", () => {
      expect(normalizePostalCode("m5v 3a8")).toBe("M5V3A8");
      expect(normalizePostalCode("sw1a 1aa")).toBe("SW1A1AA");
    });

    test("trims whitespace", () => {
      expect(normalizePostalCode("  90210  ")).toBe("90210");
      expect(normalizePostalCode("\t M5V \n")).toBe("M5V");
    });
  });

  describe("lookupTaxJurisdiction", () => {
    test("finds exact matches", () => {
      const jurisdiction = lookupTaxJurisdiction("90210");
      expect(jurisdiction).toMatchObject({
        postalCode: "90210",
        jurisdictionName: "California, USA",
        taxRateBps: 825,
        taxType: "sales_tax",
      });
    });

    test("handles Canadian postal code partial matching", () => {
      // Should match M5V prefix even with full postal code
      const jurisdiction = lookupTaxJurisdiction("M5V 3A8");
      expect(jurisdiction).toMatchObject({
        postalCode: "M5V",
        jurisdictionName: "Ontario, Canada",
        taxRateBps: 1300,
        taxType: "gst",
      });
    });

    test("handles UK postal code partial matching", () => {
      // Should match SW1A prefix
      const jurisdiction = lookupTaxJurisdiction("SW1A 1AA");
      expect(jurisdiction).toMatchObject({
        postalCode: "SW1A",
        jurisdictionName: "London, UK", 
        taxRateBps: 2000,
        taxType: "vat",
      });
    });

    test("returns null for unknown postal codes", () => {
      expect(lookupTaxJurisdiction("99999")).toBeNull();
      expect(lookupTaxJurisdiction("INVALID")).toBeNull();
      expect(lookupTaxJurisdiction("")).toBeNull();
    });

    test("handles case insensitive lookup", () => {
      const jurisdiction = lookupTaxJurisdiction("m5v 3a8");
      expect(jurisdiction?.postalCode).toBe("M5V");
    });
  });

  describe("calculateTaxBreakdown", () => {
    test("calculates correct tax breakdown for California", () => {
      const subtotal = BigInt(100_0000000); // 100 XLM in stroops
      const breakdown = calculateTaxBreakdown(subtotal, "90210");
      
      expect(breakdown).toMatchObject({
        subtotalStroops: BigInt(100_0000000),
        taxRateBps: 825, // 8.25%
        taxAmountStroops: BigInt(8_2500000), // 8.25 XLM
        totalStroops: BigInt(108_2500000), // 108.25 XLM
        noTaxApplies: false,
      });

      expect(breakdown?.jurisdiction?.jurisdictionName).toBe("California, USA");
    });

    test("calculates correct tax breakdown for Ontario HST", () => {
      const subtotal = BigInt(50_0000000); // 50 XLM
      const breakdown = calculateTaxBreakdown(subtotal, "M5V 3A8");
      
      expect(breakdown).toMatchObject({
        subtotalStroops: BigInt(50_0000000),
        taxRateBps: 1300, // 13%
        taxAmountStroops: BigInt(6_5000000), // 6.5 XLM
        totalStroops: BigInt(56_5000000), // 56.5 XLM
        noTaxApplies: false,
      });

      expect(breakdown?.jurisdiction?.taxType).toBe("gst");
    });

    test("handles zero tax jurisdictions", () => {
      const subtotal = BigInt(100_0000000);
      const breakdown = calculateTaxBreakdown(subtotal, "33101"); // Florida - no sales tax
      
      expect(breakdown).toMatchObject({
        subtotalStroops: BigInt(100_0000000),
        taxRateBps: 0,
        taxAmountStroops: BigInt(0),
        totalStroops: BigInt(100_0000000),
        noTaxApplies: false,
      });

      expect(breakdown?.jurisdiction?.jurisdictionName).toBe("Florida, USA");
    });

    test("handles unknown postal codes with no tax", () => {
      const subtotal = BigInt(100_0000000);
      const breakdown = calculateTaxBreakdown(subtotal, "UNKNOWN");
      
      expect(breakdown).toMatchObject({
        subtotalStroops: BigInt(100_0000000),
        taxRateBps: 0,
        taxAmountStroops: BigInt(0),
        totalStroops: BigInt(100_0000000),
        jurisdiction: null,
        noTaxApplies: true,
      });
    });

    test("handles edge cases", () => {
      // Zero subtotal
      const zeroBreakdown = calculateTaxBreakdown(BigInt(0), "90210");
      expect(zeroBreakdown?.taxAmountStroops).toBe(BigInt(0));
      expect(zeroBreakdown?.totalStroops).toBe(BigInt(0));

      // Empty postal code
      expect(calculateTaxBreakdown(BigInt(100_0000000), "")).toBeNull();

      // Negative subtotal
      expect(calculateTaxBreakdown(BigInt(-100), "90210")).toBeNull();
    });

    test("maintains precision with large amounts", () => {
      // 1 million XLM
      const subtotal = BigInt(1_000_000_0000000);
      const breakdown = calculateTaxBreakdown(subtotal, "90210"); // 8.25%
      
      expect(breakdown?.taxAmountStroops).toBe(BigInt(82_500_0000000)); // 82,500 XLM
      expect(breakdown?.totalStroops).toBe(BigInt(1_082_500_0000000));
    });

    test("handles fractional tax amounts correctly", () => {
      // Amount that results in fractional stroops (should round down)
      const subtotal = BigInt(33); // 33 stroops
      const breakdown = calculateTaxBreakdown(subtotal, "90210"); // 8.25%
      
      // 33 * 825 / 10000 = 2.7225 stroops -> rounds down to 2
      expect(breakdown?.taxAmountStroops).toBe(BigInt(2));
      expect(breakdown?.totalStroops).toBe(BigInt(35));
    });
  });

  describe("formatTaxRate", () => {
    test("formats basis points to percentage", () => {
      expect(formatTaxRate(825)).toBe("8.25%");
      expect(formatTaxRate(1000)).toBe("10%");
      expect(formatTaxRate(0)).toBe("0%");
      expect(formatTaxRate(1)).toBe("0.01%");
      expect(formatTaxRate(2000)).toBe("20%");
    });

    test("trims unnecessary decimals", () => {
      expect(formatTaxRate(800)).toBe("8%"); // Not 8.00%
      expect(formatTaxRate(825)).toBe("8.25%");
      expect(formatTaxRate(833)).toBe("8.33%");
    });
  });

  describe("getTaxTypeLabel", () => {
    test("returns correct labels", () => {
      expect(getTaxTypeLabel("sales_tax")).toBe("Sales Tax");
      expect(getTaxTypeLabel("vat")).toBe("VAT");
      expect(getTaxTypeLabel("gst")).toBe("GST");
      expect(getTaxTypeLabel("other")).toBe("Tax");
    });
  });

  describe("validateTaxBreakdown", () => {
    test("validates correct tax breakdowns", () => {
      const validBreakdown: TaxBreakdown = {
        subtotalStroops: BigInt(100_0000000),
        taxRateBps: 825,
        taxAmountStroops: BigInt(8_2500000),
        totalStroops: BigInt(108_2500000),
      };

      expect(validateTaxBreakdown(validBreakdown)).toBe(true);
    });

    test("detects incorrect tax calculations", () => {
      const invalidBreakdown: TaxBreakdown = {
        subtotalStroops: BigInt(100_0000000),
        taxRateBps: 825,
        taxAmountStroops: BigInt(5_0000000), // Wrong amount
        totalStroops: BigInt(105_0000000), // Wrong total
      };

      expect(validateTaxBreakdown(invalidBreakdown)).toBe(false);
    });

    test("detects negative values", () => {
      const negativeBreakdown: TaxBreakdown = {
        subtotalStroops: BigInt(-100),
        taxRateBps: 825,
        taxAmountStroops: BigInt(0),
        totalStroops: BigInt(0),
      };

      expect(validateTaxBreakdown(negativeBreakdown)).toBe(false);
    });
  });

  describe("hasTaxObligation", () => {
    test("returns true for postal codes with tax", () => {
      expect(hasTaxObligation("90210")).toBe(true); // California 8.25%
      expect(hasTaxObligation("M5V 3A8")).toBe(true); // Ontario 13%
    });

    test("returns false for zero-tax jurisdictions", () => {
      expect(hasTaxObligation("33101")).toBe(false); // Florida 0%
    });

    test("returns false for unknown postal codes", () => {
      expect(hasTaxObligation("UNKNOWN")).toBe(false);
      expect(hasTaxObligation("")).toBe(false);
    });
  });

  describe("getSupportedPostalCodes", () => {
    test("returns all configured postal codes", () => {
      const codes = getSupportedPostalCodes();
      expect(codes).toContain("90210");
      expect(codes).toContain("M5V");
      expect(codes).toContain("SW1A");
      expect(codes.length).toBeGreaterThan(10); // Should have many jurisdictions
    });

    test("returns sorted list", () => {
      const codes = getSupportedPostalCodes();
      const sorted = [...codes].sort();
      expect(codes).toEqual(sorted);
    });
  });

  describe("integration scenarios", () => {
    test("full workflow for US order", () => {
      // Simulate order from California
      const postalCode = "90210";
      const subtotal = BigInt(500_0000000); // 500 XLM order

      // Check if tax applies
      expect(hasTaxObligation(postalCode)).toBe(true);

      // Calculate breakdown
      const breakdown = calculateTaxBreakdown(subtotal, postalCode);
      expect(breakdown).not.toBeNull();
      
      // Validate calculation
      expect(validateTaxBreakdown(breakdown!)).toBe(true);

      // Check display values
      expect(formatTaxRate(breakdown!.taxRateBps)).toBe("8.25%");
      expect(getTaxTypeLabel(breakdown!.jurisdiction!.taxType)).toBe("Sales Tax");

      // Verify amounts
      expect(breakdown!.taxAmountStroops).toBe(BigInt(41_2500000)); // 41.25 XLM
      expect(breakdown!.totalStroops).toBe(BigInt(541_2500000)); // 541.25 XLM
    });

    test("full workflow for EU order", () => {
      // Simulate order from Germany
      const postalCode = "10115";
      const subtotal = BigInt(200_0000000); // 200 XLM order

      const breakdown = calculateTaxBreakdown(subtotal, postalCode);
      expect(breakdown?.jurisdiction?.taxType).toBe("vat");
      expect(breakdown?.taxRateBps).toBe(1900); // 19% VAT
      expect(breakdown?.taxAmountStroops).toBe(BigInt(38_0000000)); // 38 XLM VAT
      expect(formatTaxRate(breakdown!.taxRateBps)).toBe("19%");
      expect(getTaxTypeLabel(breakdown!.jurisdiction!.taxType)).toBe("VAT");
    });

    test("full workflow for no-tax jurisdiction", () => {
      // Simulate order from unknown location
      const postalCode = "NOWHERE";
      const subtotal = BigInt(100_0000000);

      expect(hasTaxObligation(postalCode)).toBe(false);

      const breakdown = calculateTaxBreakdown(subtotal, postalCode);
      expect(breakdown?.noTaxApplies).toBe(true);
      expect(breakdown?.taxAmountStroops).toBe(BigInt(0));
      expect(breakdown?.totalStroops).toBe(subtotal);
    });
  });
});