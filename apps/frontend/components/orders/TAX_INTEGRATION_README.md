# Tax Integration Guide

This guide explains how to integrate automated sales tax and VAT breakdown display into the Delego checkout flow.

## Overview

The tax integration provides:
- **Postal code-based tax calculation** for US, Canada, EU, and other regions
- **Itemized tax breakdown display** in checkout and receipt flows  
- **Seamless integration** with existing approval and escrow processes
- **Multi-jurisdiction support** for sales tax, VAT, GST, and other tax types

## Core Components

### 1. Tax Calculation Service (`lib/taxCalculation.ts`)

```typescript
import { calculateTaxBreakdown, formatTaxRate } from "../../lib/taxCalculation";

// Calculate tax for an order
const taxBreakdown = calculateTaxBreakdown(subtotalStroops, "90210");
if (taxBreakdown) {
  console.log(`Tax: ${formatTaxRate(taxBreakdown.taxRateBps)} = ${taxBreakdown.taxAmountStroops} stroops`);
}
```

### 2. Tax Display Components

#### TaxBreakdownDisplay - Detailed Breakdown
```typescript
import { TaxBreakdownDisplay } from "../orders/TaxBreakdownDisplay";

<TaxBreakdownDisplay
  subtotalStroops={BigInt("1000000000")} // 100 XLM
  postalCode="90210"
  showDetails={true}
/>
```

#### TaxSummaryRow - Receipt Integration
```typescript
import { TaxSummaryRow } from "../orders/TaxBreakdownDisplay";

<div className="receipt-totals">
  <TaxSummaryRow subtotalStroops={subtotal} postalCode="90210" />
</div>
```

#### TaxAwareTotal - Tax-Inclusive Totals
```typescript
import { TaxAwareTotal } from "../orders/TaxBreakdownDisplay";

<TaxAwareTotal subtotalStroops={subtotal} postalCode="90210" />
```

## Integration Patterns

### Pattern 1: Enhanced Approval Cards

```typescript
import { ApprovalCard } from "../orders/ApprovalCard";

<ApprovalCard
  order={order}
  deliveryPostalCode="90210" // Enables tax calculation
  onApprove={handleApprove}
  onReject={handleReject}
/>
```

### Pattern 2: Tax-Enabled Receipts

```typescript
import { ReceiptPanel } from "../orders/ReceiptPanel";

<ReceiptPanel 
  order={order}
  deliveryPostalCode="90210" // Shows tax breakdown in totals
/>
```

### Pattern 3: Complete Checkout Flow

```typescript
import { TaxEnabledCheckoutFlow } from "../orders/TaxEnabledCheckoutFlow";

<TaxEnabledCheckoutFlow
  order={order}
  initialPostalCode="90210"
  onApprove={(orderId, taxInclusiveAmount) => {
    // Handle approval with final tax-inclusive amount
    console.log(`Final amount: ${taxInclusiveAmount} stroops`);
  }}
  mode="full" // "full" | "tax-preview" | "receipt"
/>
```

## Data Model Extensions

### TaxEnhancedOrder Type

```typescript
import { enhanceOrderWithTax, getTaxPostalCode } from "../../lib/taxEnhancedOrder";

// Enhance existing order with tax fields
const enhancedOrder = enhanceOrderWithTax(baseOrder, "90210");

// Extract postal code for tax calculation
const postalCode = getTaxPostalCode(enhancedOrder);
```

## Supported Tax Jurisdictions

| Region | Postal Code | Tax Type | Rate | Example |
|--------|-------------|----------|------|---------|
| California, USA | 90210 | Sales Tax | 8.25% | Los Angeles |
| New York, USA | 10001 | Sales Tax | 8.00% | Manhattan |
| Texas, USA | 73301 | Sales Tax | 6.25% | Austin |
| Florida, USA | 33101 | Sales Tax | 0% | Miami |
| Ontario, Canada | M5V | HST | 13% | Toronto |
| BC, Canada | V6B | GST+PST | 12% | Vancouver |
| Berlin, Germany | 10115 | VAT | 19% | EU Standard |
| Paris, France | 75001 | VAT | 20% | EU Standard |
| London, UK | SW1A | VAT | 20% | Post-Brexit |
| Tokyo, Japan | 100-0001 | Consumption Tax | 10% | Japan Standard |
| Sydney, Australia | 2000 | GST | 10% | Australia |

## Usage Examples

### Basic Tax Preview

```typescript
function OrderTaxPreview({ order, postalCode }: Props) {
  return (
    <TaxBreakdownDisplay
      subtotalStroops={calculateSubtotal(order)}
      postalCode={postalCode}
      showDetails={true}
    />
  );
}
```

### Approval Flow Integration

```typescript
function ApprovalFlow({ order }: Props) {
  const [postalCode, setPostalCode] = useState("");
  
  return (
    <div>
      <input 
        placeholder="Delivery postal code"
        value={postalCode}
        onChange={(e) => setPostalCode(e.target.value)}
      />
      
      <ApprovalCard
        order={order}
        deliveryPostalCode={postalCode}
        onApprove={handleApprovalWithTax}
      />
    </div>
  );
}
```

### Receipt with Tax

```typescript
function OrderReceipt({ order, deliveryAddress }: Props) {
  return (
    <ReceiptPanel 
      order={order}
      deliveryPostalCode={deliveryAddress.postalCode}
    />
  );
}
```

## Testing Tax Integration

### Unit Tests

```typescript
import { calculateTaxBreakdown } from "../../lib/taxCalculation";

test("calculates California sales tax correctly", () => {
  const breakdown = calculateTaxBreakdown(BigInt("1000000000"), "90210");
  expect(breakdown?.taxRateBps).toBe(825); // 8.25%
  expect(breakdown?.taxAmountStroops).toBe(BigInt("82500000")); // 8.25 XLM
});
```

### Component Tests

```typescript
import { render } from "@testing-library/react";
import { TaxBreakdownDisplay } from "../TaxBreakdownDisplay";

test("renders tax breakdown for valid postal code", () => {
  render(
    <TaxBreakdownDisplay 
      subtotalStroops={BigInt("1000000000")}
      postalCode="90210" 
    />
  );
  expect(screen.getByText("California, USA")).toBeInTheDocument();
});
```

## Configuration

### Adding New Tax Jurisdictions

Edit `lib/taxCalculation.ts` and add entries to `TAX_JURISDICTIONS`:

```typescript
const TAX_JURISDICTIONS: Record<string, TaxJurisdiction> = {
  "12345": {
    postalCode: "12345",
    jurisdictionName: "New Location, Country",
    taxRateBps: 750, // 7.5%
    taxType: "sales_tax",
    isEstimate: false,
  },
};
```

### Customizing Tax Display

Override CSS classes in your stylesheets:

```css
.tax-breakdown-header {
  background: your-brand-color;
}

.tax-breakdown-estimate-note {
  border-color: your-warning-color;
}
```

## Error Handling

### Invalid Postal Codes
- Unknown postal codes default to no tax
- Component gracefully handles missing postal codes
- `noTaxApplies: true` flag indicates no tax jurisdiction found

### Edge Cases
- Zero amounts: tax calculation returns 0
- Negative amounts: returns null (invalid)
- Empty postal codes: returns null
- Very large amounts: maintains precision with BigInt

## Performance Considerations

- Tax calculations use BigInt for precision
- Postal code normalization is cached
- No external API calls (tax rates are hardcoded)
- Components only re-render when postal code or amount changes

## Migration Guide

### Existing Components

1. **Update ApprovalCard usage:**
   ```diff
   <ApprovalCard 
     order={order}
   + deliveryPostalCode={getDeliveryPostalCode(order)}
   />
   ```

2. **Update ReceiptPanel usage:**
   ```diff
   <ReceiptPanel 
     order={order}
   + deliveryPostalCode={order.deliveryAddress?.postalCode}
   />
   ```

3. **Add postal code collection:**
   ```typescript
   // Add to order creation flow
   const [postalCode, setPostalCode] = useState("");
   ```

### Database Schema (Future)

When backend support is added, consider these Order model extensions:

```typescript
interface Order {
  // ... existing fields
  deliveryPostalCode?: string;
  billingPostalCode?: string;
  calculatedTax?: {
    postalCode: string;
    taxRateBps: number;
    taxAmountStroops: string;
    jurisdiction: string;
    calculatedAt: string;
  };
}
```

## Accessibility

- Tax breakdowns use proper heading structure (h4)
- Amount displays inherit currency formatting
- Screen reader labels for all tax information
- High contrast mode supported
- Print stylesheet optimized for tax receipts

## Browser Support

- Modern browsers with BigInt support
- Graceful degradation for older browsers
- No external dependencies beyond React and UI components
- CSS custom properties with fallbacks