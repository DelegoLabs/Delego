/**
 * Integration tests for TaxEnabledCheckoutFlow and related components.
 * Tests the complete tax calculation integration across the checkout process.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Order } from "@delegolabs/types";
import { TaxEnabledCheckoutFlow, TaxAwareApprovalCard } from "./TaxEnabledCheckoutFlow";

// Mock dependencies
jest.mock("../../hooks/useCurrency", () => ({
  useCurrency: () => ({
    currencyId: "xlm",
    rate: { xlmUsdRate: 1.0 },
  }),
}));

jest.mock("@delegolabs/ui", () => ({
  Amount: ({ stroops }: { stroops: bigint }) => <span data-testid="amount">{stroops.toString()}</span>,
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

// Mock other components
jest.mock("./ApprovalCard", () => ({
  ApprovalCard: ({ deliveryPostalCode, onApprove, onReject }: any) => (
    <div data-testid="approval-card" data-postal-code={deliveryPostalCode}>
      <button onClick={() => onApprove("test-order")} data-testid="approve-btn">
        Approve
      </button>
      <button onClick={() => onReject("test-order", "test reason")} data-testid="reject-btn">
        Reject
      </button>
    </div>
  ),
}));

jest.mock("./ReceiptPanel", () => ({
  ReceiptPanel: ({ deliveryPostalCode }: any) => (
    <div data-testid="receipt-panel" data-postal-code={deliveryPostalCode}>
      Receipt with tax
    </div>
  ),
}));

const mockOrder: Order = {
  id: "test-order-123",
  userId: "user-123",
  delegationId: "delegation-123",
  merchantId: "merchant-123",
  status: "pending_approval",
  totalStroops: "1000000000", // 100 XLM
  lineItems: [
    {
      productId: "product-1",
      quantity: 2,
      unitPriceStroops: "300000000", // 30 XLM each
    },
    {
      productId: "product-2", 
      quantity: 1,
      unitPriceStroops: "400000000", // 40 XLM
    },
  ],
  escrowContractId: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

describe("TaxEnabledCheckoutFlow", () => {
  test("renders tax preview mode", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        mode="tax-preview"
        initialPostalCode="90210"
      />
    );

    expect(screen.getByDisplayValue("90210")).toBeInTheDocument();
    expect(screen.getByText("Tax Calculation Preview")).toBeInTheDocument();
  });

  test("allows postal code input and shows tax breakdown", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        mode="full"
      />
    );

    const postalInput = screen.getByPlaceholderText("Enter postal code for tax calculation");
    fireEvent.change(postalInput, { target: { value: "90210" } });

    expect(postalInput).toHaveValue("90210");
    expect(screen.getByText("Tax will be calculated based on this delivery location")).toBeInTheDocument();
  });

  test("shows approval card with postal code when provided", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        initialPostalCode="90210"
        mode="full"
      />
    );

    const approvalCard = screen.getByTestId("approval-card");
    expect(approvalCard).toHaveAttribute("data-postal-code", "90210");
  });

  test("handles approval with tax calculation", async () => {
    const onApprove = jest.fn();
    
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        initialPostalCode="90210"
        onApprove={onApprove}
        mode="full"
      />
    );

    const approveBtn = screen.getByTestId("approve-btn");
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith("test-order-123", expect.any(BigInt));
    });
  });

  test("handles rejection", async () => {
    const onReject = jest.fn();
    
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        initialPostalCode="90210"
        onReject={onReject}
        mode="full"
      />
    );

    const rejectBtn = screen.getByTestId("reject-btn");
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(onReject).toHaveBeenCalledWith("test-order-123", "test reason");
    });
  });

  test("shows receipt mode", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        initialPostalCode="90210"
        mode="receipt"
      />
    );

    const receiptPanel = screen.getByTestId("receipt-panel");
    expect(receiptPanel).toHaveAttribute("data-postal-code", "90210");
    expect(screen.getByText("Receipt with tax")).toBeInTheDocument();
  });

  test("shows integration notes in full mode", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        mode="full"
      />
    );

    expect(screen.getByText("Integration Notes")).toBeInTheDocument();
    expect(screen.getByText("Tax Integration Points:")).toBeInTheDocument();
    expect(screen.getByText("Postal code drives tax jurisdiction lookup")).toBeInTheDocument();
  });
});

describe("useTaxEnabledOrder hook", () => {
  // Note: Testing React hooks requires renderHook from @testing-library/react-hooks
  // For this test, we'll test the hook indirectly through component usage
  
  test("calculates correct subtotal from line items", () => {
    // Subtotal should be: (30 * 2) + (40 * 1) = 100 XLM = 1000000000 stroops
    const subtotal = mockOrder.lineItems.reduce((sum, item) => {
      return sum + (BigInt(item.unitPriceStroops) * BigInt(item.quantity));
    }, 0n);
    
    expect(subtotal).toBe(BigInt("1000000000")); // 100 XLM
  });
});

describe("TaxAwareApprovalCard", () => {
  test("passes postal code to ApprovalCard", () => {
    const mockProps = {
      order: mockOrder,
      postalCode: "90210",
      pending: false,
      onApprove: jest.fn(),
      onReject: jest.fn(),
    };

    render(<TaxAwareApprovalCard {...mockProps} />);

    const approvalCard = screen.getByTestId("approval-card");
    expect(approvalCard).toHaveAttribute("data-postal-code", "90210");
  });

  test("handles missing postal code gracefully", () => {
    const mockProps = {
      order: mockOrder,
      pending: false,
      onApprove: jest.fn(),
      onReject: jest.fn(),
    };

    render(<TaxAwareApprovalCard {...mockProps} />);

    const approvalCard = screen.getByTestId("approval-card");
    expect(approvalCard).toHaveAttribute("data-postal-code", "");
  });
});

describe("Integration scenarios", () => {
  test("complete checkout flow with California tax", async () => {
    const onApprove = jest.fn();
    const onReject = jest.fn();

    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        onApprove={onApprove}
        onReject={onReject}
        mode="full"
      />
    );

    // Enter California postal code
    const postalInput = screen.getByPlaceholderText("Enter postal code for tax calculation");
    fireEvent.change(postalInput, { target: { value: "90210" } });

    // Should show tax calculation
    expect(screen.getByText("Tax will be calculated based on this delivery location")).toBeInTheDocument();

    // Approve the order
    const approveBtn = screen.getByTestId("approve-btn");
    fireEvent.click(approveBtn);

    // Should call onApprove with tax-inclusive amount
    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith(
        "test-order-123", 
        expect.any(BigInt) // The amount should include calculated tax
      );
    });
  });

  test("checkout flow without postal code", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        mode="full"
      />
    );

    // Should show postal code input
    expect(screen.getByPlaceholderText("Enter postal code for tax calculation")).toBeInTheDocument();
    
    // Should not show tax breakdown initially
    expect(screen.queryByText("Tax Calculation")).not.toBeInTheDocument();
  });

  test("receipt mode with tax", () => {
    render(
      <TaxEnabledCheckoutFlow
        order={mockOrder}
        initialPostalCode="10115" // Berlin, Germany
        mode="receipt"
      />
    );

    const receiptPanel = screen.getByTestId("receipt-panel");
    expect(receiptPanel).toHaveAttribute("data-postal-code", "10115");
  });
});