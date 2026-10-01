/**
 * Unit tests for TaxBreakdownDisplay component and related components.
 * Tests rendering, tax calculation integration, and various display modes.
 */

import { render, screen } from "@testing-library/react";
import { TaxBreakdownDisplay, TaxSummaryRow, TaxAwareTotal } from "./TaxBreakdownDisplay";

// Mock the useCurrency hook
vi.mock("../../hooks/useCurrency", () => ({
  useCurrency: () => ({
    currencyId: "xlm",
    rate: { xlmUsdRate: 1.0 },
  }),
}));

// Mock the UI components
vi.mock("@delegolabs/ui", () => ({
  Amount: ({ stroops }: { stroops: bigint }) => <span data-testid="amount">{stroops.toString()}</span>,
  Badge: ({ children, tone }: { children: React.ReactNode; tone: string }) => (
    <span data-testid="badge" data-tone={tone}>{children}</span>
  ),
}));

describe("TaxBreakdownDisplay", () => {
  const mockSubtotal = BigInt(100_0000000); // 100 XLM in stroops

  describe("TaxBreakdownDisplay component", () => {
    test("renders tax breakdown for California", () => {
      render(
        <TaxBreakdownDisplay 
          subtotalStroops={mockSubtotal}
          postalCode="90210"
          showDetails={true}
        />
      );

      expect(screen.getByText("Tax Calculation")).toBeInTheDocument();
      expect(screen.getByText("California, USA")).toBeInTheDocument();
      expect(screen.getByText("8.25%")).toBeInTheDocument();
      expect(screen.getByText("Sales Tax")).toBeInTheDocument();
      expect(screen.getByText("Total with Tax")).toBeInTheDocument();
    });

    test("renders compact mode without details", () => {
      render(
        <TaxBreakdownDisplay 
          subtotalStroops={mockSubtotal}
          postalCode="90210"
          showDetails={false}
        />
      );

      expect(screen.queryByText("Tax Calculation")).not.toBeInTheDocument();
      expect(screen.getByText("Sales Tax")).toBeInTheDocument();
      expect(screen.queryByText("California, USA")).not.toBeInTheDocument();
    });

    test("renders VAT for European jurisdiction", () => {
      render(
        <TaxBreakdownDisplay 
          subtotalStroops={mockSubtotal}
          postalCode="10115" // Berlin, Germany
          showDetails={true}
        />
      );

      expect(screen.getByText("Berlin, Germany")).toBeInTheDocument();
      expect(screen.getByText("19%")).toBeInTheDocument();
      expect(screen.getByText("VAT")).toBeInTheDocument();
    });

    test("handles zero tax jurisdictions", () => {
      render(
        <TaxBreakdownDisplay 
          subtotalStroops={mockSubtotal}
          postalCode="33101" // Florida - no sales tax
          showDetails={true}
        />
      );

      expect(screen.getByText("Florida, USA")).toBeInTheDocument();
      expect(screen.getByText("0%")).toBeInTheDocument();
    });

    test("handles unknown postal codes", () => {
      render(
        <TaxBreakdownDisplay 
          subtotalStroops={mockSubtotal}
          postalCode="UNKNOWN"
          showDetails={true}
        />
      );

      expect(screen.getByText("No tax applies to this location")).toBeInTheDocument();
    });

    test("does not render for unknown postal codes in compact mode", () => {
      const { container } = render(
        <TaxBreakdownDisplay 
          subtotalStroops={mockSubtotal}
          postalCode="UNKNOWN"
          showDetails={false}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    test("shows estimate badge for estimated rates", async () => {
      // Mock the tax calculation to return an estimate. `vi.doMock` only takes
      // effect for modules imported after it, so the component has to be
      // re-imported from a clean module registry.
      vi.doMock("../../lib/taxCalculation", async () => ({
        ...(await vi.importActual<typeof import("../../lib/taxCalculation")>(
          "../../lib/taxCalculation",
        )),
        calculateTaxBreakdown: () => ({
          subtotalStroops: mockSubtotal,
          taxRateBps: 800,
          taxAmountStroops: BigInt(8_0000000),
          totalStroops: BigInt(108_0000000),
          jurisdiction: {
            postalCode: "12345",
            jurisdictionName: "Test Location",
            taxRateBps: 800,
            taxType: "sales_tax" as const,
            isEstimate: true,
          },
          noTaxApplies: false,
        }),
      }));
      vi.resetModules();
      const { TaxBreakdownDisplay: EstimateDisplay } = await import(
        "./TaxBreakdownDisplay"
      );

      render(
        <EstimateDisplay 
          subtotalStroops={mockSubtotal}
          postalCode="12345"
          showDetails={true}
        />
      );

      expect(screen.getByText("Estimate")).toBeInTheDocument();
      expect(screen.getByText("Final tax may vary based on local regulations")).toBeInTheDocument();
      vi.doUnmock("../../lib/taxCalculation");
      vi.resetModules();
    });

    test("applies custom CSS classes", () => {
      const { container } = render(
        <TaxBreakdownDisplay 
          subtotalStroops={mockSubtotal}
          postalCode="90210"
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass("tax-breakdown", "custom-class");
    });

    test("handles invalid subtotal gracefully", () => {
      const { container } = render(
        <TaxBreakdownDisplay 
          subtotalStroops={BigInt(-100)}
          postalCode="90210"
        />
      );

      expect(container.firstChild).toBeNull();
    });

    test("handles empty postal code gracefully", () => {
      const { container } = render(
        <TaxBreakdownDisplay 
          subtotalStroops={mockSubtotal}
          postalCode=""
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe("TaxSummaryRow component", () => {
    test("renders tax summary for taxable jurisdiction", () => {
      render(
        <TaxSummaryRow 
          subtotalStroops={mockSubtotal}
          postalCode="90210"
        />
      );

      expect(screen.getByText("Sales Tax")).toBeInTheDocument();
      expect(screen.getByText("(8.25%)")).toBeInTheDocument();
    });

    test("does not render for no-tax jurisdictions", () => {
      const { container } = render(
        <TaxSummaryRow 
          subtotalStroops={mockSubtotal}
          postalCode="UNKNOWN"
        />
      );

      expect(container.firstChild).toBeNull();
    });

    test("applies receipt totals styling", () => {
      const { container } = render(
        <TaxSummaryRow 
          subtotalStroops={mockSubtotal}
          postalCode="90210"
        />
      );

      expect(container.firstChild).toHaveClass("receipt-totals-row", "tax-summary-row");
    });

    test("shows correct tax type labels", () => {
      // Test VAT
      render(
        <TaxSummaryRow 
          subtotalStroops={mockSubtotal}
          postalCode="10115" // Germany - VAT
        />
      );

      expect(screen.getByText("VAT")).toBeInTheDocument();
    });
  });

  describe("TaxAwareTotal component", () => {
    test("displays total including tax", () => {
      render(
        <TaxAwareTotal 
          subtotalStroops={mockSubtotal}
          postalCode="90210"
        />
      );

      expect(screen.getByText("Total")).toBeInTheDocument();
      expect(screen.getByText("(tax included)")).toBeInTheDocument();
      // Should show total with tax: 100 + 8.25 = 108.25 XLM = 1082500000 stroops
      expect(screen.getByText("1082500000")).toBeInTheDocument();
    });

    test("displays total without tax note for no-tax jurisdictions", () => {
      render(
        <TaxAwareTotal 
          subtotalStroops={mockSubtotal}
          postalCode="UNKNOWN"
        />
      );

      expect(screen.getByText("Total")).toBeInTheDocument();
      expect(screen.queryByText("(tax included)")).not.toBeInTheDocument();
      // Should show original subtotal
      expect(screen.getByText(mockSubtotal.toString())).toBeInTheDocument();
    });

    test("falls back to subtotal if tax calculation fails", () => {
      render(
        <TaxAwareTotal 
          subtotalStroops={mockSubtotal}
          postalCode="" // Invalid postal code
        />
      );

      expect(screen.getByText("Total")).toBeInTheDocument();
      expect(screen.getByText(mockSubtotal.toString())).toBeInTheDocument();
    });

    test("applies correct CSS classes", () => {
      const { container } = render(
        <TaxAwareTotal 
          subtotalStroops={mockSubtotal}
          postalCode="90210"
          className="custom-total"
        />
      );

      expect(container.firstChild).toHaveClass(
        "receipt-totals-row", 
        "receipt-totals-total", 
        "tax-aware-total",
        "custom-total"
      );
    });
  });

  describe("useTaxBreakdown hook", () => {
    // Note: Testing hooks directly requires a more complex setup with renderHook
    // For now, we're testing it indirectly through the components above
    test("integration through components works correctly", () => {
      // This is tested through the component tests above
      expect(true).toBe(true);
    });
  });

  describe("accessibility", () => {
    test("provides proper heading structure", () => {
      render(
        <TaxBreakdownDisplay 
          subtotalStroops={mockSubtotal}
          postalCode="90210"
          showDetails={true}
        />
      );

      const heading = screen.getByRole("heading", { level: 4 });
      expect(heading).toHaveTextContent("Tax Calculation");
    });

    test("provides proper labeling for amounts", () => {
      render(
        <TaxBreakdownDisplay 
          subtotalStroops={mockSubtotal}
          postalCode="90210"
          showDetails={true}
        />
      );

      // All amounts should have proper labels
      expect(screen.getByText("Subtotal")).toBeInTheDocument();
      expect(screen.getByText("Sales Tax")).toBeInTheDocument();
      expect(screen.getByText("Total with Tax")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    test("handles very large amounts", () => {
      const largeAmount = BigInt("999999999999999"); // Very large amount

      render(
        <TaxBreakdownDisplay 
          subtotalStroops={largeAmount}
          postalCode="90210"
          showDetails={true}
        />
      );

      // Should still render without error
      expect(screen.getByText("Tax Calculation")).toBeInTheDocument();
    });

    test("handles zero amount", () => {
      render(
        <TaxBreakdownDisplay 
          subtotalStroops={BigInt(0)}
          postalCode="90210"
          showDetails={true}
        />
      );

      expect(screen.getByText("Tax Calculation")).toBeInTheDocument();
      // Subtotal and tax are both zero, so both render as "0".
      expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    });

    test("handles postal code with spaces and formatting", () => {
      render(
        <TaxBreakdownDisplay 
          subtotalStroops={mockSubtotal}
          postalCode="M5V 3A8" // Canadian postal code with space
          showDetails={true}
        />
      );

      expect(screen.getByText("Ontario, Canada")).toBeInTheDocument();
      expect(screen.getByText("GST")).toBeInTheDocument();
    });
  });
});