/**
 * Tax calculation service for automated sales tax and VAT breakdown
 * based on postal code jurisdiction (Issue: Checkout Tax Implementation).
 *
 * Provides postal code-based tax rate determination and structured
 * tax breakdown calculations for display in checkout flow before
 * escrow funding. Amounts are in stroops (bigint) throughout.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Tax breakdown structure as specified in the requirements.
 * All amounts are in stroops for consistency with the existing codebase.
 */
export interface TaxBreakdown {
  /** Subtotal before tax in stroops */
  subtotalStroops: bigint;
  /** Tax rate in basis points (1 bps = 0.01%) */
  taxRateBps: number;
  /** Calculated tax amount in stroops */
  taxAmountStroops: bigint;
  /** Total amount including tax in stroops */
  totalStroops: bigint;
}

/**
 * Tax jurisdiction configuration for a postal code or region.
 */
export interface TaxJurisdiction {
  /** Postal code or region identifier */
  postalCode: string;
  /** Human-readable jurisdiction name (e.g., "California, USA", "Ontario, Canada") */
  jurisdictionName: string;
  /** Tax rate in basis points (1 bps = 0.01%) */
  taxRateBps: number;
  /** Tax type (sales tax, VAT, GST, etc.) */
  taxType: "sales_tax" | "vat" | "gst" | "other";
  /** Whether this is an estimate or exact rate */
  isEstimate: boolean;
}

/**
 * Extended tax breakdown with jurisdiction information for display.
 */
export interface TaxBreakdownWithJurisdiction extends TaxBreakdown {
  /** Tax jurisdiction information */
  jurisdiction: TaxJurisdiction | null;
  /** True if no tax applies to this postal code */
  noTaxApplies: boolean;
}

// ─── Tax Rate Database ──────────────────────────────────────────────────────

/**
 * Sample tax jurisdiction database. In a production system, this would
 * be loaded from an external tax service API or database.
 * 
 * Using basis points for precision: 825 bps = 8.25%
 */
const TAX_JURISDICTIONS: Record<string, TaxJurisdiction> = {
  // United States - Sales Tax
  "90210": {
    postalCode: "90210",
    jurisdictionName: "California, USA",
    taxRateBps: 825, // 8.25%
    taxType: "sales_tax",
    isEstimate: false,
  },
  "10001": {
    postalCode: "10001",
    jurisdictionName: "New York, USA", 
    taxRateBps: 800, // 8.00%
    taxType: "sales_tax",
    isEstimate: false,
  },
  "73301": {
    postalCode: "73301",
    jurisdictionName: "Texas, USA",
    taxRateBps: 625, // 6.25%
    taxType: "sales_tax", 
    isEstimate: false,
  },
  "33101": {
    postalCode: "33101",
    jurisdictionName: "Florida, USA",
    taxRateBps: 0, // No state sales tax
    taxType: "sales_tax",
    isEstimate: false,
  },

  // Canada - GST/PST/HST
  "M5V": {
    postalCode: "M5V",
    jurisdictionName: "Ontario, Canada",
    taxRateBps: 1300, // 13% HST
    taxType: "gst",
    isEstimate: false,
  },
  "V6B": {
    postalCode: "V6B", 
    jurisdictionName: "British Columbia, Canada",
    taxRateBps: 1200, // 12% (5% GST + 7% PST)
    taxType: "gst",
    isEstimate: false,
  },

  // European Union - VAT
  "10115": {
    postalCode: "10115",
    jurisdictionName: "Berlin, Germany",
    taxRateBps: 1900, // 19% VAT
    taxType: "vat",
    isEstimate: false,
  },
  "75001": {
    postalCode: "75001",
    jurisdictionName: "Paris, France", 
    taxRateBps: 2000, // 20% VAT
    taxType: "vat",
    isEstimate: false,
  },
  "SW1A": {
    postalCode: "SW1A",
    jurisdictionName: "London, UK",
    taxRateBps: 2000, // 20% VAT
    taxType: "vat",
    isEstimate: false,
  },

  // Asia-Pacific  
  "100-0001": {
    postalCode: "100-0001",
    jurisdictionName: "Tokyo, Japan",
    taxRateBps: 1000, // 10% consumption tax
    taxType: "other",
    isEstimate: false,
  },
  "2000": {
    postalCode: "2000", 
    jurisdictionName: "Sydney, Australia",
    taxRateBps: 1000, // 10% GST
    taxType: "gst",
    isEstimate: false,
  },
};

// ─── Tax Calculation Functions ──────────────────────────────────────────────

/**
 * Normalize postal code for lookup by removing spaces, hyphens and
 * converting to uppercase. Handles various international formats.
 */
export function normalizePostalCode(postalCode: string): string {
  return postalCode
    .replace(/[\s\-]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * Look up tax jurisdiction by postal code. Uses exact match first,
 * then tries partial matching for countries with complex postal systems.
 */
export function lookupTaxJurisdiction(postalCode: string): TaxJurisdiction | null {
  const normalized = normalizePostalCode(postalCode);
  
  // Try exact match first
  if (TAX_JURISDICTIONS[normalized]) {
    return TAX_JURISDICTIONS[normalized];
  }

  // Try partial matching for specific formats
  // Canadian postal codes: match first 3 characters (e.g., M5V 3A8 -> M5V)
  if (normalized.length >= 3 && /^[A-Z]\d[A-Z]/.test(normalized)) {
    const prefix = normalized.substring(0, 3);
    if (TAX_JURISDICTIONS[prefix]) {
      return TAX_JURISDICTIONS[prefix];
    }
  }

  // UK postal codes: match area code (e.g., SW1A 1AA -> SW1A)  
  if (normalized.length >= 4 && /^[A-Z]{1,2}\d{1,2}[A-Z]?/.test(normalized)) {
    const areaMatch = normalized.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);
    if (areaMatch && TAX_JURISDICTIONS[areaMatch[1]]) {
      return TAX_JURISDICTIONS[areaMatch[1]];
    }
  }

  return null;
}

/**
 * Calculate tax breakdown for a given subtotal and postal code.
 * 
 * @param subtotalStroops Subtotal amount in stroops before tax
 * @param postalCode Delivery postal code for tax jurisdiction lookup
 * @returns Tax breakdown with jurisdiction info, or null if postal code invalid
 */
export function calculateTaxBreakdown(
  subtotalStroops: bigint,
  postalCode: string
): TaxBreakdownWithJurisdiction | null {
  if (!postalCode || subtotalStroops < 0n) {
    return null;
  }

  const jurisdiction = lookupTaxJurisdiction(postalCode);
  
  // No tax jurisdiction found - assume no tax applies
  if (!jurisdiction) {
    return {
      subtotalStroops,
      taxRateBps: 0,
      taxAmountStroops: 0n,
      totalStroops: subtotalStroops,
      jurisdiction: null,
      noTaxApplies: true,
    };
  }

  // Calculate tax amount using basis points
  // Formula: tax = (subtotal * taxRateBps) / 10,000
  const taxAmountStroops = (subtotalStroops * BigInt(jurisdiction.taxRateBps)) / 10_000n;
  const totalStroops = subtotalStroops + taxAmountStroops;

  return {
    subtotalStroops,
    taxRateBps: jurisdiction.taxRateBps,
    taxAmountStroops,
    totalStroops,
    jurisdiction,
    noTaxApplies: false,
  };
}

/**
 * Formats tax rate from basis points to percentage string.
 * Example: 825 bps -> "8.25%"
 */
export function formatTaxRate(taxRateBps: number): string {
  const percentage = taxRateBps / 100;
  // Show up to 2 decimal places, but trim trailing zeros
  return `${parseFloat(percentage.toFixed(2))}%`;
}

/**
 * Get human-readable tax type label for display.
 */
export function getTaxTypeLabel(taxType: TaxJurisdiction["taxType"]): string {
  switch (taxType) {
    case "sales_tax":
      return "Sales Tax";
    case "vat":
      return "VAT";
    case "gst":
      return "GST";
    case "other":
      return "Tax";
    default:
      return "Tax";
  }
}

/**
 * Validate that a tax breakdown is mathematically correct.
 * Used in tests and for defensive programming.
 */
export function validateTaxBreakdown(breakdown: TaxBreakdown): boolean {
  const expectedTax = (breakdown.subtotalStroops * BigInt(breakdown.taxRateBps)) / 10_000n;
  const expectedTotal = breakdown.subtotalStroops + expectedTax;
  
  return (
    breakdown.taxAmountStroops === expectedTax &&
    breakdown.totalStroops === expectedTotal &&
    breakdown.subtotalStroops >= 0n &&
    breakdown.taxRateBps >= 0
  );
}

// ─── Convenience Functions ──────────────────────────────────────────────────

/**
 * Quick check if postal code has any tax obligations.
 * Useful for conditional display logic.
 */
export function hasTaxObligation(postalCode: string): boolean {
  const jurisdiction = lookupTaxJurisdiction(postalCode);
  return jurisdiction !== null && jurisdiction.taxRateBps > 0;
}

/**
 * Get all supported postal code prefixes for testing and validation.
 * Returns sorted list of postal codes that have tax configuration.
 */
export function getSupportedPostalCodes(): string[] {
  return Object.keys(TAX_JURISDICTIONS).sort();
}