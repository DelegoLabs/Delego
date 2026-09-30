/**
 * Enhanced Order types with tax-related fields for automated sales tax and VAT calculation.
 * Extends the base Order type from @delegolabs/types with tax-specific properties.
 */

import type { Order } from "@delegolabs/types";

/**
 * Enhanced order interface that includes tax-related fields.
 * This extends the base Order type with postal code information needed for tax calculation.
 */
export interface TaxEnhancedOrder extends Order {
  /** Delivery postal code for tax jurisdiction lookup */
  deliveryPostalCode?: string;
  /** Billing postal code (fallback if delivery postal code not available) */
  billingPostalCode?: string;
  /** Whether tax calculation should be applied to this order */
  taxCalculationEnabled?: boolean;
  /** Cached tax calculation results to avoid recalculation */
  calculatedTax?: {
    /** When the tax was calculated (for cache validity) */
    calculatedAt: string;
    /** Postal code used for calculation */
    postalCode: string;
    /** Tax rate in basis points */
    taxRateBps: number;
    /** Tax amount in stroops */
    taxAmountStroops: string; // String-encoded bigint like other stroops fields
    /** Jurisdiction information */
    jurisdiction?: {
      name: string;
      taxType: "sales_tax" | "vat" | "gst" | "other";
    };
  };
}

/**
 * Type guard to check if an order has tax enhancement fields.
 */
export function isTaxEnhancedOrder(order: Order): order is TaxEnhancedOrder {
  return "deliveryPostalCode" in order || "billingPostalCode" in order;
}

/**
 * Get the postal code to use for tax calculation from an enhanced order.
 * Prefers delivery postal code, falls back to billing postal code.
 */
export function getTaxPostalCode(order: TaxEnhancedOrder): string | undefined {
  return order.deliveryPostalCode || order.billingPostalCode;
}

/**
 * Utility to enhance a regular Order with postal code information.
 * Useful for adding tax fields when you have postal code from other sources
 * (e.g., user settings, delegation configuration, etc.).
 */
export function enhanceOrderWithTax(
  order: Order,
  postalCode: string,
  options?: {
    useAsDelivery?: boolean;
    enableTaxCalculation?: boolean;
  }
): TaxEnhancedOrder {
  const { useAsDelivery = true, enableTaxCalculation = true } = options || {};
  
  return {
    ...order,
    [useAsDelivery ? "deliveryPostalCode" : "billingPostalCode"]: postalCode,
    taxCalculationEnabled: enableTaxCalculation,
  };
}

/**
 * Extract regular Order from tax-enhanced order (removes tax-specific fields).
 */
export function extractBaseOrder(enhancedOrder: TaxEnhancedOrder): Order {
  const {
    deliveryPostalCode: _deliveryPostalCode,
    billingPostalCode: _billingPostalCode,
    taxCalculationEnabled: _taxCalculationEnabled,
    calculatedTax: _calculatedTax,
    ...baseOrder
  } = enhancedOrder;
  
  return baseOrder;
}