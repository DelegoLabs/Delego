/**
 * Unit tests for taxEnhancedOrder utilities.
 * Tests order enhancement, postal code extraction, and type guards.
 */

import type { Order } from "@delegolabs/types";
import {
  enhanceOrderWithTax,
  extractBaseOrder,
  getTaxPostalCode,
  isTaxEnhancedOrder,
  type TaxEnhancedOrder,
} from "./taxEnhancedOrder";

const mockBaseOrder: Order = {
  id: "order-123",
  userId: "user-123",
  delegationId: "delegation-123",
  merchantId: "merchant-123",
  status: "pending_approval",
  totalStroops: "1000000000",
  lineItems: [
    {
      productId: "product-1",
      quantity: 2,
      unitPriceStroops: "500000000",
    },
  ],
  escrowContractId: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

describe("taxEnhancedOrder", () => {
  describe("enhanceOrderWithTax", () => {
    test("adds delivery postal code by default", () => {
      const enhanced = enhanceOrderWithTax(mockBaseOrder, "90210");
      
      expect(enhanced.deliveryPostalCode).toBe("90210");
      expect(enhanced.taxCalculationEnabled).toBe(true);
      expect(enhanced.billingPostalCode).toBeUndefined();
    });

    test("adds billing postal code when specified", () => {
      const enhanced = enhanceOrderWithTax(mockBaseOrder, "90210", {
        useAsDelivery: false,
      });
      
      expect(enhanced.billingPostalCode).toBe("90210");
      expect(enhanced.deliveryPostalCode).toBeUndefined();
    });

    test("can disable tax calculation", () => {
      const enhanced = enhanceOrderWithTax(mockBaseOrder, "90210", {
        enableTaxCalculation: false,
      });
      
      expect(enhanced.taxCalculationEnabled).toBe(false);
    });

    test("preserves all original order properties", () => {
      const enhanced = enhanceOrderWithTax(mockBaseOrder, "90210");
      
      expect(enhanced.id).toBe(mockBaseOrder.id);
      expect(enhanced.userId).toBe(mockBaseOrder.userId);
      expect(enhanced.status).toBe(mockBaseOrder.status);
      expect(enhanced.totalStroops).toBe(mockBaseOrder.totalStroops);
      expect(enhanced.lineItems).toEqual(mockBaseOrder.lineItems);
    });

    test("handles empty postal code", () => {
      const enhanced = enhanceOrderWithTax(mockBaseOrder, "");
      
      expect(enhanced.deliveryPostalCode).toBe("");
      expect(enhanced.taxCalculationEnabled).toBe(true);
    });
  });

  describe("extractBaseOrder", () => {
    test("removes tax-specific fields", () => {
      const enhanced: TaxEnhancedOrder = {
        ...mockBaseOrder,
        deliveryPostalCode: "90210",
        billingPostalCode: "90211",
        taxCalculationEnabled: true,
        calculatedTax: {
          calculatedAt: "2024-01-01T00:00:00Z",
          postalCode: "90210",
          taxRateBps: 825,
          taxAmountStroops: "82500000",
          jurisdiction: {
            name: "California, USA",
            taxType: "sales_tax",
          },
        },
      };

      const base = extractBaseOrder(enhanced);
      
      expect(base).toEqual(mockBaseOrder);
      expect("deliveryPostalCode" in base).toBe(false);
      expect("billingPostalCode" in base).toBe(false);
      expect("taxCalculationEnabled" in base).toBe(false);
      expect("calculatedTax" in base).toBe(false);
    });

    test("preserves original order if no tax fields present", () => {
      const enhanced = mockBaseOrder as TaxEnhancedOrder;
      const base = extractBaseOrder(enhanced);
      
      expect(base).toEqual(mockBaseOrder);
    });
  });

  describe("getTaxPostalCode", () => {
    test("prefers delivery postal code", () => {
      const enhanced: TaxEnhancedOrder = {
        ...mockBaseOrder,
        deliveryPostalCode: "90210",
        billingPostalCode: "90211",
      };

      expect(getTaxPostalCode(enhanced)).toBe("90210");
    });

    test("falls back to billing postal code", () => {
      const enhanced: TaxEnhancedOrder = {
        ...mockBaseOrder,
        billingPostalCode: "90211",
      };

      expect(getTaxPostalCode(enhanced)).toBe("90211");
    });

    test("returns undefined if neither postal code present", () => {
      const enhanced: TaxEnhancedOrder = {
        ...mockBaseOrder,
      };

      expect(getTaxPostalCode(enhanced)).toBeUndefined();
    });

    test("handles empty postal codes", () => {
      const enhanced: TaxEnhancedOrder = {
        ...mockBaseOrder,
        deliveryPostalCode: "",
        billingPostalCode: "90211",
      };

      // Empty delivery postal code should fall back to billing
      expect(getTaxPostalCode(enhanced)).toBe("90211");
    });
  });

  describe("isTaxEnhancedOrder", () => {
    test("returns true for orders with delivery postal code", () => {
      const enhanced: TaxEnhancedOrder = {
        ...mockBaseOrder,
        deliveryPostalCode: "90210",
      };

      expect(isTaxEnhancedOrder(enhanced)).toBe(true);
    });

    test("returns true for orders with billing postal code", () => {
      const enhanced: TaxEnhancedOrder = {
        ...mockBaseOrder,
        billingPostalCode: "90210",
      };

      expect(isTaxEnhancedOrder(enhanced)).toBe(true);
    });

    test("returns true for orders with both postal codes", () => {
      const enhanced: TaxEnhancedOrder = {
        ...mockBaseOrder,
        deliveryPostalCode: "90210",
        billingPostalCode: "90211",
      };

      expect(isTaxEnhancedOrder(enhanced)).toBe(true);
    });

    test("returns false for base orders", () => {
      expect(isTaxEnhancedOrder(mockBaseOrder)).toBe(false);
    });

    test("returns false for orders with only other tax fields", () => {
      const partiallyEnhanced = {
        ...mockBaseOrder,
        taxCalculationEnabled: true,
      };

      expect(isTaxEnhancedOrder(partiallyEnhanced)).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("handles null and undefined postal codes", () => {
      const enhanced1 = enhanceOrderWithTax(mockBaseOrder, null as any);
      const enhanced2 = enhanceOrderWithTax(mockBaseOrder, undefined as any);
      
      expect(enhanced1.deliveryPostalCode).toBe(null);
      expect(enhanced2.deliveryPostalCode).toBe(undefined);
    });

    test("handles special characters in postal codes", () => {
      const specialCodes = ["M5V 3A8", "SW1A-1AA", "10115-030", "K1A 0A6"];
      
      specialCodes.forEach(code => {
        const enhanced = enhanceOrderWithTax(mockBaseOrder, code);
        expect(enhanced.deliveryPostalCode).toBe(code);
      });
    });

    test("preserves order immutability", () => {
      const enhanced = enhanceOrderWithTax(mockBaseOrder, "90210");
      
      // Original order should not be modified
      expect("deliveryPostalCode" in mockBaseOrder).toBe(false);
      expect(enhanced).not.toBe(mockBaseOrder);
    });

    test("handles orders with existing extra properties", () => {
      const orderWithExtras = {
        ...mockBaseOrder,
        customField: "custom-value",
        internalNote: "internal-note",
      } as any;

      const enhanced = enhanceOrderWithTax(orderWithExtras, "90210");
      // Unrecognised order fields are passed through untouched, so they are
      // not part of the TaxEnhancedOrder contract.
      const passthrough = enhanced as unknown as Record<string, unknown>;

      expect(passthrough.customField).toBe("custom-value");
      expect(passthrough.internalNote).toBe("internal-note");
      expect(enhanced.deliveryPostalCode).toBe("90210");
    });

    test("extraction preserves extra properties", () => {
      const enhancedWithExtras: TaxEnhancedOrder = {
        ...mockBaseOrder,
        deliveryPostalCode: "90210",
        customField: "custom-value",
      } as any;

      const base = extractBaseOrder(enhancedWithExtras);
      
      expect((base as any).customField).toBe("custom-value");
      expect("deliveryPostalCode" in base).toBe(false);
    });
  });

  describe("calculated tax caching", () => {
    test("can store calculated tax results", () => {
      const enhanced: TaxEnhancedOrder = {
        ...mockBaseOrder,
        deliveryPostalCode: "90210",
        calculatedTax: {
          calculatedAt: "2024-01-01T12:00:00Z",
          postalCode: "90210",
          taxRateBps: 825,
          taxAmountStroops: "82500000",
          jurisdiction: {
            name: "California, USA",
            taxType: "sales_tax",
          },
        },
      };

      expect(enhanced.calculatedTax?.taxRateBps).toBe(825);
      expect(enhanced.calculatedTax?.jurisdiction?.name).toBe("California, USA");
    });

    test("calculated tax is removed during extraction", () => {
      const enhanced: TaxEnhancedOrder = {
        ...mockBaseOrder,
        deliveryPostalCode: "90210",
        calculatedTax: {
          calculatedAt: "2024-01-01T12:00:00Z",
          postalCode: "90210",
          taxRateBps: 825,
          taxAmountStroops: "82500000",
        },
      };

      const base = extractBaseOrder(enhanced);
      
      expect("calculatedTax" in base).toBe(false);
    });
  });

  describe("type safety", () => {
    test("enhanced order is assignable to base order", () => {
      const enhanced = enhanceOrderWithTax(mockBaseOrder, "90210");
      
      // This should compile without errors
      const useAsBase: Order = enhanced;
      expect(useAsBase.id).toBe(mockBaseOrder.id);
    });

    test("type guard narrows type correctly", () => {
      const order: Order = mockBaseOrder;
      
      if (isTaxEnhancedOrder(order)) {
        // TypeScript should know this is TaxEnhancedOrder now
        const postalCode = order.deliveryPostalCode;
        expect(typeof postalCode).toBe("undefined"); // Since mockBaseOrder has no postal code
      }
    });
  });
});