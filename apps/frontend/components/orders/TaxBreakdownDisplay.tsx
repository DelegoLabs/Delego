"use client";

import { Amount, Badge } from "@delegolabs/ui";
import { useCurrency } from "../../hooks/useCurrency";
import {
  calculateTaxBreakdown,
  formatTaxRate,
  getTaxTypeLabel,
  type TaxBreakdownWithJurisdiction,
} from "../../lib/taxCalculation";

export interface TaxBreakdownDisplayProps {
  /** Subtotal amount in stroops before tax */
  subtotalStroops: bigint;
  /** Delivery postal code for tax jurisdiction lookup */
  postalCode: string;
  /** Additional CSS class names */
  className?: string;
  /** Whether to show detailed breakdown or just the tax line */
  showDetails?: boolean;
}

/**
 * Tax breakdown display component for checkout summary.
 * Shows itemized tax calculation based on delivery postal code,
 * including jurisdiction info, tax rate, and calculated amounts.
 * 
 * Follows the same design patterns as ReceiptPanel for consistency.
 */
export function TaxBreakdownDisplay({
  subtotalStroops,
  postalCode,
  className = "",
  showDetails = true,
}: TaxBreakdownDisplayProps) {
  const { currencyId, rate } = useCurrency();
  
  // Calculate tax breakdown
  const taxBreakdown = calculateTaxBreakdown(subtotalStroops, postalCode);
  
  // Don't render anything if calculation failed
  if (!taxBreakdown) {
    return null;
  }

  // Don't render if no tax applies and not showing details
  if (taxBreakdown.noTaxApplies && !showDetails) {
    return null;
  }

  return (
    <div className={`tax-breakdown ${className}`}>
      {showDetails && (
        <>
          <div className="tax-breakdown-header">
            <h4 className="tax-breakdown-title">Tax Calculation</h4>
            {taxBreakdown.jurisdiction && (
              <div className="tax-breakdown-jurisdiction">
                <Badge tone="neutral" size="sm">
                  {taxBreakdown.jurisdiction.jurisdictionName}
                </Badge>
                <span className="tax-breakdown-rate">
                  {formatTaxRate(taxBreakdown.taxRateBps)}
                </span>
              </div>
            )}
          </div>

          {taxBreakdown.noTaxApplies ? (
            <div className="tax-breakdown-no-tax">
              <span className="tax-breakdown-label">No tax applies to this location</span>
            </div>
          ) : (
            <div className="tax-breakdown-details">
              <div className="tax-breakdown-row">
                <span className="tax-breakdown-label">Subtotal</span>
                <Amount 
                  stroops={taxBreakdown.subtotalStroops} 
                  currency={currencyId} 
                  xlmUsdRate={rate?.xlmUsdRate} 
                />
              </div>
              
              <div className="tax-breakdown-row tax-breakdown-tax-line">
                <span className="tax-breakdown-label">
                  {taxBreakdown.jurisdiction 
                    ? getTaxTypeLabel(taxBreakdown.jurisdiction.taxType)
                    : "Tax"
                  }
                  {taxBreakdown.taxRateBps > 0 && (
                    <span className="tax-breakdown-rate-inline">
                      {" "}({formatTaxRate(taxBreakdown.taxRateBps)})
                    </span>
                  )}
                </span>
                <Amount 
                  stroops={taxBreakdown.taxAmountStroops} 
                  currency={currencyId} 
                  xlmUsdRate={rate?.xlmUsdRate} 
                />
              </div>
              
              <div className="tax-breakdown-row tax-breakdown-total">
                <span className="tax-breakdown-label">
                  <strong>Total with Tax</strong>
                </span>
                <strong>
                  <Amount 
                    stroops={taxBreakdown.totalStroops} 
                    currency={currencyId} 
                    xlmUsdRate={rate?.xlmUsdRate} 
                  />
                </strong>
              </div>
            </div>
          )}
          
          {taxBreakdown.jurisdiction?.isEstimate && (
            <div className="tax-breakdown-estimate-note">
              <Badge tone="warning" size="sm">
                Estimate
              </Badge>
              <span className="tax-breakdown-estimate-text">
                Final tax may vary based on local regulations
              </span>
            </div>
          )}
        </>
      )}
      
      {!showDetails && !taxBreakdown.noTaxApplies && (
        <div className="tax-breakdown-row tax-breakdown-compact">
          <span className="tax-breakdown-label">
            {taxBreakdown.jurisdiction 
              ? getTaxTypeLabel(taxBreakdown.jurisdiction.taxType)
              : "Tax"
            }
          </span>
          <Amount 
            stroops={taxBreakdown.taxAmountStroops} 
            currency={currencyId} 
            xlmUsdRate={rate?.xlmUsdRate} 
          />
        </div>
      )}
    </div>
  );
}

export interface TaxSummaryRowProps {
  /** Subtotal amount in stroops before tax */
  subtotalStroops: bigint;
  /** Delivery postal code for tax jurisdiction lookup */
  postalCode: string;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Simplified tax summary row for use in receipt totals sections.
 * Shows just the tax amount without detailed breakdown.
 */
export function TaxSummaryRow({
  subtotalStroops,
  postalCode,
  className = "",
}: TaxSummaryRowProps) {
  const { currencyId, rate } = useCurrency();
  const taxBreakdown = calculateTaxBreakdown(subtotalStroops, postalCode);
  
  // Don't render if no tax breakdown or no tax applies
  if (!taxBreakdown || taxBreakdown.noTaxApplies) {
    return null;
  }

  return (
    <div className={`receipt-totals-row tax-summary-row ${className}`}>
      <span>
        {taxBreakdown.jurisdiction 
          ? getTaxTypeLabel(taxBreakdown.jurisdiction.taxType)
          : "Tax"
        }
        {taxBreakdown.taxRateBps > 0 && (
          <span className="tax-rate-inline">
            {" "}({formatTaxRate(taxBreakdown.taxRateBps)})
          </span>
        )}
      </span>
      <Amount 
        stroops={taxBreakdown.taxAmountStroops} 
        currency={currencyId} 
        xlmUsdRate={rate?.xlmUsdRate} 
      />
    </div>
  );
}

export interface TaxAwareTotalProps {
  /** Subtotal amount in stroops before tax */
  subtotalStroops: bigint;
  /** Delivery postal code for tax jurisdiction lookup */
  postalCode: string;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Tax-aware total display that shows the final amount including tax.
 * Used to replace existing total displays in checkout flows.
 */
export function TaxAwareTotal({
  subtotalStroops,
  postalCode,
  className = "",
}: TaxAwareTotalProps) {
  const { currencyId, rate } = useCurrency();
  const taxBreakdown = calculateTaxBreakdown(subtotalStroops, postalCode);
  
  // Fall back to subtotal if tax calculation fails
  const totalStroops = taxBreakdown?.totalStroops ?? subtotalStroops;

  return (
    <div className={`receipt-totals-row receipt-totals-total tax-aware-total ${className}`}>
      <span>
        <strong>Total</strong>
        {taxBreakdown && !taxBreakdown.noTaxApplies && (
          <span className="tax-inclusive-note"> (tax included)</span>
        )}
      </span>
      <strong>
        <Amount 
          stroops={totalStroops} 
          currency={currencyId} 
          xlmUsdRate={rate?.xlmUsdRate} 
        />
      </strong>
    </div>
  );
}

/**
 * Hook to get tax breakdown data for use in other components.
 * Useful for components that need tax information but handle their own display.
 */
export function useTaxBreakdown(subtotalStroops: bigint, postalCode: string): TaxBreakdownWithJurisdiction | null {
  return calculateTaxBreakdown(subtotalStroops, postalCode);
}