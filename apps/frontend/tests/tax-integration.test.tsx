/**
 * End-to-end integration tests for the complete tax calculation system.
 * Tests the full workflow from postal code input to tax display in receipts.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import type { Order } from "@delegolabs/types";
import { calculateTaxBreakdown } from "../lib/taxCalculation";
import { enhanceOrderWithTax } from "../lib/taxEnhancedOrder";
import { TaxBreakdownDisplay, TaxSummaryRow, TaxAwareTotal } from "../components/orders/TaxBreakdownDisplay";
import { TaxEnabledCheckoutFlow } from "../components/orders/TaxEnabledCheckoutFlow";

// Mock dependencies
jest.mock("../hooks/useCurrency", () => ({
  useCurrency: () => ({
    currencyId: "xlm",
    rate: { xlmUsdRate: 0.10 }, // 1 XLM = $0.10 for easier test calculations
  }),
}));

jest.mock("@delegolabs/ui", () => ({
  Amount: ({ stroops, currency }: { stroops: bigint; currency: string }) => {
    const xlm = Number(stroops) / 10_000_000; // Convert stroops to XLM
    return <span data-testid="amount" data-currency={currency}>{xlm.toFixed(2)} XLM</span>;
  },
  Badge: ({ children, tone }: { children: React.ReactNode; tone: string }) => (
    <span data-testid="badge" data-tone={tone}>{children}</span>
  ),
  Card: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="card" data-title={title}>{children}</div>
  ),
  Button: ({ children, onClick, variant }: { 
    children: React.ReactNode; 
    onClick?: () => void; 
    variant?: string;
  }) => (
    <button onClick={onClick} data-variant={variant}>{children}</button>
  ),
  FormField: ({ children, label }: { children: React.ReactNode; label: string }) => (
    <div>
      <label>{label}</label>
      {children}
    </div>
  ),
}));

const createTestOrder = (lineItems: Array<{ productId: string; quantity: number; price: number }>): Order => ({
  id: "test-order-123",
  userId: "user-123", 
  delegationId: "delegation-123",
  merchantId: "merchant-123",
  status: "pending_approval",
  totalStroops: "0", // Will be calculated
  lineItems: lineItems.map(item => ({
    productId: item.productId,
    quantity: item.quantity,
    unitPriceStroops: (item.price * 10_000_000).toString(), // Convert to stroops
  })),
  escrowContractId: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
});

describe("Tax Integration E2E", () => {
  describe("Tax Calculation Accuracy", () => {
    test("calculates correct tax for various jurisdictions", () => {
      const testCases = [
        { postalCode: "90210", location: "California", expectedRate: 8.25, type: "Sales Tax" },
        { postalCode: "10115", location: "Berlin", expectedRate: 19.0, type: "VAT" },
        { postalCode: "M5V 3A8", location: "Ontario", expectedRate: 13.0, type: "GST" },
        { postalCode: "33101", location: "Florida", expectedRate: 0.0, type: "Sales Tax" },
      ];

      testCases.forEach(({ postalCode, expectedRate }) => {
        const breakdown = calculateTaxBreakdown(BigInt("1000000000"), postalCode); // 100 XLM
        
        expect(breakdown).not.toBeNull();
        expect(breakdown!.taxRateBps).toBe(expectedRate * 100); // Convert % to bps
        
        const expectedTaxStroops = BigInt(Math.floor(1000000000 * (expectedRate / 100)));
        expect(breakdown!.taxAmountStroops).toBe(expectedTaxStroops);
      });
    });

    test("handles international postal code formats", () => {
      const internationalCodes = [
        "M5V 3A8", // Canada with space
        "SW1A 1AA", // UK with space
        "100-0001", // Japan with hyphen
        "10115", // Germany numeric
      ];

      internationalCodes.forEach(postalCode => {
        const breakdown = calculateTaxBreakdown(BigInt("1000000000"), postalCode);
        expect(breakdown).not.toBeNull();
        // Should find jurisdiction or default to no tax
      });
    });

    test("precision with large amounts", () => {
      // Test with 1 million XLM (very large order)
      const largeAmount = BigInt("10000000000000000"); // 1M XLM in stroops
      const breakdown = calculateTaxBreakdown(largeAmount, "90210"); // 8.25%
      
      expect(breakdown).not.toBeNull();
      expect(breakdown!.taxAmountStroops).toBe(BigInt("825000000000000")); // 82,500 XLM tax
    });

    test("precision with small amounts", () => {
      // Test with 1 stroop (smallest unit)
      const breakdown = calculateTaxBreakdown(BigInt("1"), "90210"); // 8.25%
      
      expect(breakdown).not.toBeNull();
      expect(breakdown!.taxAmountStroops).toBe(BigInt("0")); // Rounds down to 0
      expect(breakdown!.totalStroops).toBe(BigInt("1"));
    });
  });

  describe("Component Integration", () => {
    test("tax breakdown display shows complete information", () => {
      render(
        <TaxBreakdownDisplay
          subtotalStroops={BigInt("1000000000")} // 100 XLM
          postalCode="90210"
          showDetails={true}
        />
      );

      expect(screen.getByText("Tax Calculation")).toBeInTheDocument();
      expect(screen.getByText("California, USA")).toBeInTheDocument();
      expect(screen.getByText("8.25%")).toBeInTheDocument();
      expect(screen.getByText("Sales Tax")).toBeInTheDocument();
      
      // Should show subtotal, tax, and total amounts
      const amounts = screen.getAllByTestId("amount");
      expect(amounts).toHaveLength(3); // Subtotal, tax, total
      
      // Verify amounts: 100 XLM subtotal + 8.25 XLM tax = 108.25 XLM total
      expect(amounts[0]).toHaveTextContent("100.00 XLM"); // Subtotal
      expect(amounts[1]).toHaveTextContent("8.25 XLM");   // Tax  
      expect(amounts[2]).toHaveTextContent("108.25 XLM"); // Total
    });

    test("tax summary row integrates into receipt totals", () => {
      render(
        <div className="receipt-totals">
          <div className="receipt-totals-row">
            <span>Subtotal</span>
            <span>100.00 XLM</span>
          </div>
          <TaxSummaryRow
            subtotalStroops={BigInt("1000000000")}
            postalCode="10115" // Berlin, 19% VAT
          />
          <div className="receipt-totals-row">
            <span>Total</span>
            <span>119.00 XLM</span>
          </div>
        </div>
      );

      expect(screen.getByText("VAT")).toBeInTheDocument();
      expect(screen.getByText("(19%)")).toBeInTheDocument();
      expect(screen.getByText("19.00 XLM")).toBeInTheDocument();
    });

    test("tax aware total shows correct final amount", () => {
      render(
        <TaxAwareTotal
          subtotalStroops={BigInt("500000000")} // 50 XLM
          postalCode="M5V" // Ontario, 13% HST
        />
      );

      expect(screen.getByText("Total")).toBeInTheDocument();
      expect(screen.getByText("(tax included)")).toBeInTheDocument();
      expect(screen.getByText("56.50 XLM")).toBeInTheDocument(); // 50 + 6.5 = 56.5
    });
  });

  describe("Order Enhancement Integration", () => {
    test("enhances order with postal code correctly", () => {
      const baseOrder = createTestOrder([
        { productId: "widget", quantity: 2, price: 25 }, // 50 XLM total
      ]);

      const enhanced = enhanceOrderWithTax(baseOrder, "90210");
      
      expect(enhanced.deliveryPostalCode).toBe("90210");
      expect(enhanced.taxCalculationEnabled).toBe(true);
      expect(enhanced.id).toBe(baseOrder.id);
      expect(enhanced.lineItems).toEqual(baseOrder.lineItems);
    });
  });

  describe("End-to-End Checkout Flow", () => {
    test("complete checkout flow with tax calculation", () => {
      const order = createTestOrder([
        { productId: "laptop", quantity: 1, price: 1000 }, // 1000 XLM
        { productId: "mouse", quantity: 2, price: 25 },   // 50 XLM
      ]);
      // Total: 1050 XLM subtotal

      const onApprove = jest.fn();

      render(
        <TaxEnabledCheckoutFlow
          order={order}
          onApprove={onApprove}
          mode="full"
        />
      );

      // Enter postal code
      const postalInput = screen.getByPlaceholderText("Enter postal code for tax calculation");
      fireEvent.change(postalInput, { target: { value: "90210" } });

      // Should show tax calculation message
      expect(screen.getByText("Tax will be calculated based on this delivery location")).toBeInTheDocument();

      // Should show tax breakdown
      expect(screen.getByText("Tax Calculation")).toBeInTheDocument();
      expect(screen.getByText("California, USA")).toBeInTheDocument();

      // Tax should be 8.25% of 1050 XLM = 86.625 XLM
      expect(screen.getByText("86.63 XLM")).toBeInTheDocument(); // Rounded tax amount
    });

    test("handles no-tax jurisdictions gracefully", () => {
      const order = createTestOrder([
        { productId: "item", quantity: 1, price: 100 },
      ]);

      render(
        <TaxEnabledCheckoutFlow
          order={order}
          initialPostalCode="33101" // Florida, no sales tax
          mode="tax-preview"
        />
      );

      expect(screen.getByDisplayValue("33101")).toBeInTheDocument();
      expect(screen.getByText("Florida, USA")).toBeInTheDocument();
      expect(screen.getByText("0%")).toBeInTheDocument();
    });

    test("handles unknown postal codes", () => {
      const order = createTestOrder([
        { productId: "item", quantity: 1, price: 100 },
      ]);

      render(
        <TaxEnabledCheckoutFlow
          order={order}
          initialPostalCode="UNKNOWN"
          mode="tax-preview"
        />
      );

      expect(screen.getByText("No tax applies to this location")).toBeInTheDocument();
    });
  });

  describe("Error Handling and Edge Cases", () => {
    test("handles zero amount orders", () => {
      render(
        <TaxBreakdownDisplay
          subtotalStroops={BigInt("0")}
          postalCode="90210"
          showDetails={true}
        />
      );

      expect(screen.getByText("0.00 XLM")).toBeInTheDocument(); // Zero tax on zero amount
    });

    test("handles invalid postal codes gracefully", () => {
      const { container } = render(
        <TaxBreakdownDisplay
          subtotalStroops={BigInt("1000000000")}
          postalCode=""
          showDetails={false}
        />
      );

      expect(container.firstChild).toBeNull(); // Should not render anything
    });

    test("handles component without postal code", () => {
      const { container } = render(
        <TaxSummaryRow
          subtotalStroops={BigInt("1000000000")}
          postalCode="NOWHERE"
        />
      );

      expect(container.firstChild).toBeNull(); // No tax row for unknown jurisdiction
    });
  });

  describe("Multi-Currency Integration", () => {
    test("tax calculation works with different currency display", () => {
      // Tax calculation should always work in stroops internally,
      // regardless of display currency
      render(
        <TaxBreakdownDisplay
          subtotalStroops={BigInt("1000000000")} // 100 XLM
          postalCode="90210"
          showDetails={true}
        />
      );

      // All amounts should be displayed in XLM regardless of USD rate
      const amounts = screen.getAllByTestId("amount");
      amounts.forEach(amount => {
        expect(amount).toHaveAttribute("data-currency", "xlm");
      });
    });
  });

  describe("Performance and Memory", () => {
    test("handles large numbers of line items", () => {
      // Create order with 100 line items
      const manyItems = Array.from({ length: 100 }, (_, i) => ({
        productId: `item-${i}`,
        quantity: 1,
        price: 1, // 1 XLM each
      }));
      
      const order = createTestOrder(manyItems);
      
      render(
        <TaxEnabledCheckoutFlow
          order={order}
          initialPostalCode="90210"
          mode="tax-preview"
        />
      );

      // Should calculate tax on 100 XLM total
      expect(screen.getByText("8.25 XLM")).toBeInTheDocument(); // 8.25% of 100 XLM
    });

    test("recalculation on postal code change is efficient", () => {
      const { rerender } = render(
        <TaxBreakdownDisplay
          subtotalStroops={BigInt("1000000000")}
          postalCode="90210"
          showDetails={true}
        />
      );

      expect(screen.getByText("California, USA")).toBeInTheDocument();

      // Change to different jurisdiction
      rerender(
        <TaxBreakdownDisplay
          subtotalStroops={BigInt("1000000000")}
          postalCode="10115"
          showDetails={true}
        />
      );

      expect(screen.getByText("Berlin, Germany")).toBeInTheDocument();
      expect(screen.getByText("19%")).toBeInTheDocument(); // VAT rate
    });
  });
});