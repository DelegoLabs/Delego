"use client";

import { useId, useMemo, useState } from "react";
import { Card, Button, FormField } from "@delegolabs/ui";
import type { Order } from "@delegolabs/types";
import { ApprovalCard } from "./ApprovalCard";
import { ReceiptPanel } from "./ReceiptPanel";
import { TaxBreakdownDisplay } from "./TaxBreakdownDisplay";
import { enhanceOrderWithTax, getTaxPostalCode, type TaxEnhancedOrder } from "../../lib/taxEnhancedOrder";
import { calculateTaxBreakdown } from "../../lib/taxCalculation";
import { receiptSubtotalStroops } from "../../lib/receipts";
import {
  DELIVERY_INSTRUCTIONS_MAX_LENGTH,
  DeliveryInstructionsError,
  encryptDeliveryNote,
  formatDeliveryNote,
  type DeliveryNoteOrderMetadata,
} from "../../lib/deliveryInstructions";
import { useAddressValidation } from "../../hooks/useAddressValidation";

export interface TaxEnabledCheckoutFlowProps {
  /** Base order information */
  order: Order;
  /** Initial postal code (can come from user settings, delegation config, etc.) */
  initialPostalCode?: string;
  /**
   * The merchant's delivery key (`deliveryPublicKey` from the merchant
   * directory, see `merchantDeliveryKey`). Delivery instructions are sealed
   * with it in the browser; without it the field is disabled.
   */
  merchantPublicKey?: string;
  /**
   * Callback when order is approved with tax-inclusive amount. When the buyer
   * left delivery instructions, `metadata.encryptedDeliveryNote` carries the
   * sealed note for the order request; the plaintext is never passed on.
   */
  onApprove?: (
    orderId: string,
    taxInclusiveAmount: bigint,
    metadata?: DeliveryNoteOrderMetadata
  ) => void | Promise<void>;
  /** Callback when order is rejected */
  onReject?: (orderId: string, reason?: string) => void | Promise<void>;
  /** Whether to show the full checkout flow or just the tax calculation */
  mode?: "full" | "tax-preview" | "receipt";
}

const COUNTRY_OPTIONS = [
  { value: "US", label: "United States" },
  { value: "UK", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
  { value: "NL", label: "Netherlands" },
  { value: "BE", label: "Belgium" },
  { value: "IE", label: "Ireland" },
  { value: "AT", label: "Austria" },
];

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
  merchantPublicKey,
  onApprove,
  onReject,
  mode = "full",
}: TaxEnabledCheckoutFlowProps) {
  const [streetAddress, setStreetAddress] = useState("");
  const [postalCode, setPostalCode] = useState(initialPostalCode);
  const [countryCode, setCountryCode] = useState("US");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(mode === "receipt");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const deliveryFieldId = useId();
  const deliveryKeyAvailable = Boolean(merchantPublicKey?.trim());

  const addressValidation = useAddressValidation({
    streetAddress,
    postalCode,
    countryCode,
  });

  const effectivePostalCode = useMemo(
    () => addressValidation.formattedPostalCode || postalCode,
    [addressValidation.formattedPostalCode, postalCode]
  );

  // Calculate subtotal from line items
  const subtotal = receiptSubtotalStroops(order);

  // Calculate tax breakdown if postal code is provided
  const taxBreakdown = effectivePostalCode ? calculateTaxBreakdown(subtotal, effectivePostalCode) : null;

  const handleApprove = async (orderId: string) => {
    if (!addressValidation.isValid) return;
    setIsProcessing(true);
    try {
      let metadata: DeliveryNoteOrderMetadata | undefined;
      if (deliveryInstructions.trim()) {
        try {
          const note = await encryptDeliveryNote(
            deliveryInstructions,
            merchantPublicKey ?? ""
          );
          metadata = formatDeliveryNote(note);
        } catch (err) {
          setDeliveryError(
            err instanceof DeliveryInstructionsError
              ? err.message
              : "Delivery instructions could not be encrypted."
          );
          throw err;
        }
        // Only the sealed note is kept; drop the plaintext right away.
        setDeliveryInstructions("");
        setDeliveryError(null);
      }

      // Calculate final amount including tax
      const finalAmount = taxBreakdown?.totalStroops ?? subtotal;
      
      if (metadata) {
        await onApprove?.(orderId, finalAmount, metadata);
      } else {
        await onApprove?.(orderId, finalAmount);
      }
      
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
            postalCode={effectivePostalCode}
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
        
        {/* Step 1: Delivery Information */}
        <Card title="Delivery Information" className="checkout-step">
          <div style={{ display: "grid", gap: "1rem", maxWidth: "420px" }}>
            <FormField label="Street address" required>
              <input
                type="text"
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value)}
                placeholder="123 Main St"
                style={{ padding: "0.75rem", width: "100%" }}
              />
            </FormField>

            <FormField label="Country" required>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                style={{ padding: "0.75rem", width: "100%" }}
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Postal code" required>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="Enter postal code"
                style={{ padding: "0.75rem", width: "100%" }}
              />
            </FormField>
          </div>

          {addressValidation.validationError && (
            <div
              role="alert"
              style={{
                marginTop: "0.75rem",
                color: "var(--color-danger-text, #b91c1c)",
                fontSize: "0.875rem",
              }}
            >
              {addressValidation.validationError}
            </div>
          )}
          <div style={{ marginTop: "1rem" }}>
            <FormField
              label="Delivery instructions (gate code, buzzer)"
              inputProps={{ id: deliveryFieldId }}
              hint={
                deliveryKeyAvailable
                  ? "Encrypted in your browser with the merchant's key. Only the merchant can read it."
                  : "This merchant has not published a delivery key, so delivery instructions can't be sent securely."
              }
              error={deliveryError ?? undefined}
            >
              <textarea
                id={deliveryFieldId}
                value={deliveryInstructions}
                onChange={(e) => {
                  setDeliveryInstructions(e.target.value);
                  setDeliveryError(null);
                }}
                maxLength={DELIVERY_INSTRUCTIONS_MAX_LENGTH}
                rows={3}
                disabled={!deliveryKeyAvailable || isProcessing}
                autoComplete="off"
                spellCheck={false}
                aria-describedby={
                  deliveryError
                    ? `${deliveryFieldId}-hint ${deliveryFieldId}-error`
                    : `${deliveryFieldId}-hint`
                }
                aria-invalid={deliveryError ? true : undefined}
                placeholder="Optional, e.g. gate code 4821, buzzer 12B"
                style={{
                  padding: "0.75rem",
                  width: "100%",
                  maxWidth: "480px",
                }}
              />
            </FormField>
          </div>
        </Card>

        {/* Step 2: Tax Calculation Preview */}
        {effectivePostalCode && (
          <Card title="Tax Calculation" className="checkout-step">
            <TaxBreakdownDisplay
              subtotalStroops={subtotal}
              postalCode={effectivePostalCode}
              showDetails={true}
            />
          </Card>
        )}

        {/* Step 3: Order Approval with Tax */}
        <div className="checkout-step">
          <ApprovalCard
            order={order}
            deliveryPostalCode={effectivePostalCode || undefined}
            pending={isProcessing}
            approveDisabled={!addressValidation.isValid}
            approveDisabledReason={addressValidation.validationError ?? "Address validation failed."}
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