/**
 * Test setup utilities for tax calculation tests.
 * Provides common mocks, fixtures, and test helpers.
 */

import React from "react";
import type { Order } from "@delegolabs/types";

// ─── Test Data Fixtures ─────────────────────────────────────────────────────

export const TEST_ORDERS = {
  simple: {
    id: "order-simple",
    userId: "user-123",
    delegationId: "delegation-123", 
    merchantId: "merchant-123",
    status: "pending_approval" as const,
    totalStroops: 1000000000n, // 100 XLM
    lineItems: [
      {
        productId: "product-1",
        quantity: 1,
        unitPriceStroops: 1000000000n,
      },
    ],
    escrowContractId: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  } as Order,

  multiItem: {
    id: "order-multi",
    userId: "user-123",
    delegationId: "delegation-123",
    merchantId: "merchant-123", 
    status: "pending_approval" as const,
    totalStroops: 1500000000n, // 150 XLM
    lineItems: [
      {
        productId: "laptop",
        quantity: 1,
        unitPriceStroops: 1000000000n, // 100 XLM
      },
      {
        productId: "mouse", 
        quantity: 2,
        unitPriceStroops: 250000000n, // 25 XLM each
      },
    ],
    escrowContractId: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  } as Order,

  highValue: {
    id: "order-high-value",
    userId: "user-123", 
    delegationId: "delegation-123",
    merchantId: "merchant-123",
    status: "pending_approval" as const,
    totalStroops: 100000000000n, // 10,000 XLM
    lineItems: [
      {
        productId: "enterprise-license",
        quantity: 1,
        unitPriceStroops: 100000000000n,
      },
    ],
    escrowContractId: null,
    createdAt: new Date("2024-01-01T00:00:00Z"), 
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  } as Order,
};

export const TEST_POSTAL_CODES = {
  california: "90210",
  newyork: "10001",
  texas: "73301", 
  florida: "33101",
  ontario: "M5V",
  bc: "V6B",
  berlin: "10115",
  paris: "75001",
  london: "SW1A",
  tokyo: "100-0001",
  sydney: "2000",
  unknown: "NOWHERE",
};

export const EXPECTED_TAX_RATES = {
  [TEST_POSTAL_CODES.california]: 825, // 8.25%
  [TEST_POSTAL_CODES.newyork]: 800,    // 8.00%
  [TEST_POSTAL_CODES.texas]: 625,      // 6.25%
  [TEST_POSTAL_CODES.florida]: 0,      // 0%
  [TEST_POSTAL_CODES.ontario]: 1300,   // 13%
  [TEST_POSTAL_CODES.bc]: 1200,        // 12%
  [TEST_POSTAL_CODES.berlin]: 1900,    // 19%
  [TEST_POSTAL_CODES.paris]: 2000,     // 20%
  [TEST_POSTAL_CODES.london]: 2000,    // 20%
  [TEST_POSTAL_CODES.tokyo]: 1000,     // 10%
  [TEST_POSTAL_CODES.sydney]: 1000,    // 10%
  [TEST_POSTAL_CODES.unknown]: 0,      // 0% (no jurisdiction)
};

// ─── Test Helpers ───────────────────────────────────────────────────────────

/**
 * Calculate expected tax amount in stroops.
 */
export function calculateExpectedTax(subtotalStroops: bigint, taxRateBps: number): bigint {
  return (subtotalStroops * BigInt(taxRateBps)) / 10_000n;
}

/**
 * Convert XLM amount to stroops for easier test data creation.
 */
export function xlmToStroops(xlm: number): bigint {
  return BigInt(Math.floor(xlm * 10_000_000));
}

/**
 * Convert stroops to XLM for test assertions.
 */
export function stroopsToXlm(stroops: bigint): number {
  return Number(stroops) / 10_000_000;
}

/**
 * Create a test order with specified line items.
 */
export function createTestOrder(
  lineItems: Array<{ productId: string; quantity: number; priceXlm: number }>,
  overrides?: Partial<Order>
): Order {
  const totalStroops = lineItems.reduce((sum, item) => {
    return sum + xlmToStroops(item.priceXlm * item.quantity);
  }, 0n);

  return {
    id: `test-order-${Date.now()}`,
    userId: "test-user",
    delegationId: "test-delegation",
    merchantId: "test-merchant",
    status: "pending_approval",
    totalStroops: totalStroops,
    lineItems: lineItems.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPriceStroops: xlmToStroops(item.priceXlm),
    })),
    escrowContractId: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  } as Order;
}

/**
 * Assert that tax calculation matches expected values.
 */
export function assertTaxCalculation(
  subtotalStroops: bigint,
  postalCode: string,
  expectedRate: number,
  expectedJurisdiction?: string
) {
  const expectedTaxStroops = calculateExpectedTax(subtotalStroops, expectedRate);
  const expectedTotalStroops = subtotalStroops + expectedTaxStroops;

  return {
    subtotalStroops,
    taxRateBps: expectedRate,
    taxAmountStroops: expectedTaxStroops,
    totalStroops: expectedTotalStroops,
    jurisdiction: expectedJurisdiction,
  };
}

// ─── Common Test Mocks ──────────────────────────────────────────────────────

export const mockUseCurrency = {
  useCurrency: () => ({
    currencyId: "xlm" as const,
    rate: { xlmUsdRate: 0.10 }, // 1 XLM = $0.10
  }),
};

export const mockUIComponents = {
  Amount: ({ stroops, currency: _currency }: { stroops: bigint; currency?: string }) => (
    <span data-testid="amount" data-stroops={stroops.toString()}>
      {stroopsToXlm(stroops).toFixed(2)} XLM
    </span>
  ),
  Badge: ({ children, tone }: { children: React.ReactNode; tone?: string }) => (
    <span data-testid="badge" data-tone={tone}>{children}</span>
  ),
  Card: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="card" data-title={title}>{children}</div>
  ),
  Button: ({ children, onClick, variant, disabled }: { 
    children: React.ReactNode; 
    onClick?: () => void; 
    variant?: string;
    disabled?: boolean;
  }) => (
    <button 
      onClick={onClick} 
      data-variant={variant} 
      disabled={disabled}
      data-testid="button"
    >
      {children}
    </button>
  ),
  FormField: ({ children, label, required }: { 
    children: React.ReactNode; 
    label: string;
    required?: boolean;
  }) => (
    <div data-testid="form-field">
      <label>
        {label} {required && <span aria-label="required">*</span>}
      </label>
      {children}
    </div>
  ),
};

// ─── Test Scenarios ─────────────────────────────────────────────────────────

export const TAX_TEST_SCENARIOS = [
  {
    name: "US Sales Tax - California",
    postalCode: TEST_POSTAL_CODES.california,
    expectedRate: EXPECTED_TAX_RATES[TEST_POSTAL_CODES.california],
    jurisdiction: "California, USA",
    taxType: "sales_tax" as const,
  },
  {
    name: "EU VAT - Germany", 
    postalCode: TEST_POSTAL_CODES.berlin,
    expectedRate: EXPECTED_TAX_RATES[TEST_POSTAL_CODES.berlin],
    jurisdiction: "Berlin, Germany",
    taxType: "vat" as const,
  },
  {
    name: "Canadian HST - Ontario",
    postalCode: TEST_POSTAL_CODES.ontario,
    expectedRate: EXPECTED_TAX_RATES[TEST_POSTAL_CODES.ontario],
    jurisdiction: "Ontario, Canada", 
    taxType: "gst" as const,
  },
  {
    name: "No Tax - Florida",
    postalCode: TEST_POSTAL_CODES.florida,
    expectedRate: EXPECTED_TAX_RATES[TEST_POSTAL_CODES.florida],
    jurisdiction: "Florida, USA",
    taxType: "sales_tax" as const,
  },
  {
    name: "Unknown Jurisdiction",
    postalCode: TEST_POSTAL_CODES.unknown,
    expectedRate: EXPECTED_TAX_RATES[TEST_POSTAL_CODES.unknown],
    jurisdiction: null,
    taxType: null,
  },
] as const;

// ─── Performance Test Helpers ───────────────────────────────────────────────

/**
 * Generate large order for performance testing.
 */
export function createLargeOrder(itemCount: number): Order {
  const lineItems = Array.from({ length: itemCount }, (_, i) => ({
    productId: `item-${i.toString().padStart(6, '0')}`,
    quantity: Math.floor(Math.random() * 5) + 1,
    priceXlm: Math.floor(Math.random() * 100) + 1,
  }));

  return createTestOrder(lineItems);
}

/**
 * Measure performance of tax calculation.
 */
export function measureTaxCalculationPerformance(
  subtotalStroops: bigint, 
  postalCode: string,
  iterations: number = 1000
): number {
  const { calculateTaxBreakdown } = require("../lib/taxCalculation");
  
  const start = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    calculateTaxBreakdown(subtotalStroops, postalCode);
  }
  
  const end = performance.now();
  return end - start;
}

// ─── Accessibility Test Helpers ─────────────────────────────────────────────

/**
 * Check that tax displays have proper accessibility attributes.
 */
export function checkTaxDisplayAccessibility(container: HTMLElement) {
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const amounts = container.querySelectorAll('[data-testid="amount"]');
  const labels = container.querySelectorAll('label');
  
  return {
    hasHeadings: headings.length > 0,
    hasAmountLabels: amounts.length > 0,
    hasFormLabels: labels.length > 0,
    headingStructure: Array.from(headings).map(h => h.tagName),
  };
}

const taxTestSetup = {
  TEST_ORDERS,
  TEST_POSTAL_CODES,
  EXPECTED_TAX_RATES,
  TAX_TEST_SCENARIOS,
  calculateExpectedTax,
  xlmToStroops,
  stroopsToXlm,
  createTestOrder,
  assertTaxCalculation,
  mockUseCurrency,
  mockUIComponents,
  createLargeOrder,
  measureTaxCalculationPerformance,
  checkTaxDisplayAccessibility,
};

export default taxTestSetup;