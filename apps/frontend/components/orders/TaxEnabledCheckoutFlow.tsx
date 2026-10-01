"use client";

import { useState } from "react";
import { Card, Button, FormField } from "@delegolabs/ui";
import type { Order } from "@delegolabs/types";
import { ApprovalCard } from "./ApprovalCard";
import { ReceiptPanel } from "./ReceiptPanel";
import { TaxBreakdownDisplay } from "./TaxBreakdownDisplay";
import { enhanceOrderWithTax, getTaxPostalCode, type TaxEnhancedOrder } from "../../lib/taxEnhancedOrder";
import { calculateTaxBreakdown } from "../../lib/taxCalculation";
import { receiptSubtotalStroops } from "../../lib/receipts";

export interface TaxEnabledCheckoutFlowProps {
  /** Base order information */
  order: Order;
  /** Initial postal code (can come from user settings, delegation config, etc.) */
  initialPostalCode?: string;
  /** Callback when order is approved with tax-inclusive amount */
  onApprove?: (orderId: string, taxInclusiveAmount: bigint) => void | Promise<void>;
  /** Callback when order is rejected */
  onReject?: (orderId: string, reason?: string) => void | Promise<void>;
  /** Whether to show the full checkout flow or just the tax calculation */
  mode?: "full" | "tax-preview" | "receipt";
}

/**
 * Complete checkout flow with integrated tax calculation.
 * Demonstrates how to integrate tax calculation throughout the order lifecycle:
 * 1. Tax preview during order review
 * 2. Tax breakdown in approval cards
 * 3. Tax summary in receipts
 * 
 * This shows the complete integration pattern for automated sales tax and VAT.
 */
export function TaxEnabledCheckoutFlow({
  order,
  initialPostalCode = "",
  onApprove,
  onReject,
  mode = "full",
}: TaxEnabledCheckoutFlowProps) {
  const [postalCode, setPostalCode] = useState(initialPostalCode);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(mode === "receipt");

  // Calculate subtotal from line items
  const subtotal = receiptSubtotalStroops(order);

  // Calculate tax breakdown if postal code is provided
  const taxBreakdown = postalCode ? calculateTaxBreakdown(subtotal, postalCode) : null;

  const handleApprove = async (orderId: string) => {
    setIsProcessing(true);
    try {
      // Calculate final amount including tax
      const finalAmount = taxBreakdown?.totalStroops ?? subtotal;
      
      await onApprove?.(orderId, finalAmount);
      
      // Show receipt after successful approval
      if (mode === "full") {
        setShowReceipt(true);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (orderId: string, reason?: string) => {
    setIsProcessing(true);
    try {
      await onReject?.(orderId, reason);
    } finally {
      setIsProcessing(false);
    }
  };

  if (mode === "tax-preview") {
    return (
      <div className="tax-preview-mode">
        <Card title="Tax Calculation Preview">
          <div style={{ marginBottom: "1rem" }}>
            <FormField label="Delivery Postal Code">
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="Enter postal code for tax calculation"
                style={{ padding: "0.5rem", width: "250px" }}
              />
            </FormField>
          </div>
          
          <TaxBreakdownDisplay
            subtotalStroops={subtotal}
            postalCode={postalCode}
            showDetails={true}
          />
        </Card>
      </div>
    );
  }

  if (showReceipt || mode === "receipt") {
    return (
      <div className="checkout-receipt">
        <ReceiptPanel
          order={order}
        />
        {mode === "full" && (
          <div style={{ marginTop: "1rem", textAlign: "center" }}>
            <Button
              variant="secondary"
              onClick={() => setShowReceipt(false)}
            >
              ← Back to Order Review
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tax-enabled-checkout">
      <div className="checkout-steps">
        
        {/* Step 1: Postal Code Configuration */}
        <Card title="Delivery Information" className="checkout-step">
          <FormField label="Delivery Postal Code" required>
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="Enter postal code for tax calculation"
              style={{ padding: "0.75rem", width: "100%", maxWidth: "300px" }}
            />
          </FormField>
          {postalCode && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
              Tax will be calculated based on this delivery location
            </div>
          )}
        </Card>

        {/* Step 2: Tax Calculation Preview */}
        {postalCode && (
          <Card title="Tax Calculation" className="checkout-step">
            <TaxBreakdownDisplay
              subtotalStroops={subtotal}
              postalCode={postalCode}
              showDetails={true}
            />
          </Card>
        )}

        {/* Step 3: Order Approval with Tax */}
        <div className="checkout-step">
          <ApprovalCard
            order={order}
            deliveryPostalCode={postalCode || undefined}
            pending={isProcessing}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </div>

        {/* Integration Notes */}
        {mode === "full" && (
          <Card title="Integration Notes" className="checkout-step">
            <div style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
              <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--color-text-primary)" }}>
                Tax Integration Points:
              </h4>
              <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                <li>Postal code drives tax jurisdiction lookup</li>
                <li>Tax breakdown shows before order approval</li>
                <li>Final amount includes calculated tax</li>
                <li>Receipt displays itemized tax breakdown</li>
                <li>Supports US sales tax, EU VAT, Canadian GST/HST</li>
              </ul>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/**
 * Hook for tax-enabled order management.
 * Provides utilities for working with tax-enhanced orders.
 */
export function useTaxEnabledOrder(baseOrder: Order, postalCode?: string) {
  const enhancedOrder = postalCode 
    ? enhanceOrderWithTax(baseOrder, postalCode)
    : baseOrder as TaxEnhancedOrder;

  const effectivePostalCode = getTaxPostalCode(enhancedOrder);
  
  // Calculate subtotal from line items
  const subtotal = receiptSubtotalStroops(baseOrder);

  // Calculate tax if postal code is available
  const taxBreakdown = effectivePostalCode 
    ? calculateTaxBreakdown(subtotal, effectivePostalCode)
    : null;

  return {
    enhancedOrder,
    subtotal,
    taxBreakdown,
    effectivePostalCode,
    hasTax: taxBreakdown && !taxBreakdown.noTaxApplies,
    totalWithTax: taxBreakdown?.totalStroops ?? subtotal,
  };
}

/**
 * Simplified tax-aware approval card wrapper.
 * Automatically handles postal code from various sources.
 */
export function TaxAwareApprovalCard({
  order,
  postalCode,
  ...props
}: Omit<React.ComponentProps<typeof ApprovalCard>, 'deliveryPostalCode'> & {
  postalCode?: string;
}) {
  return (
    <ApprovalCard
      {...props}
      order={order}
      deliveryPostalCode={postalCode}
    />
  );
}

/**
 * Simplified tax-aware receipt panel wrapper.
 * Automatically handles postal code from various sources.
 */
export function TaxAwareReceiptPanel({
  order,
  postalCode,
  ...props
}: Omit<React.ComponentProps<typeof ReceiptPanel>, 'deliveryPostalCode'> & {
  postalCode?: string;
}) {
  return (
    <ReceiptPanel
      {...props}
      order={order}
    />
  );
}