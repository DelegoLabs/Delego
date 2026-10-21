import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReceiptPanel } from "./ReceiptPanel";
import type { Order } from "@delegolabs/types";

vi.mock("../../hooks/useCurrency", () => ({
  useCurrency: () => ({
    currencyId: "xlm",
    rate: { xlmUsdRate: 1.0 },
  }),
}));

vi.mock("@delegolabs/ui", () => ({
  Amount: ({ stroops }: { stroops: any }) => (
    <span data-testid="amount">{String(stroops)}</span>
  ),
  Card: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="card">
      {title ? <h3>{title}</h3> : null}
      {children}
    </div>
  ),
  Button: ({ children, onClick, variant }: any) => (
    <button onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
}));

vi.mock("./TaxBreakdownPanel", () => ({
  TaxBreakdownPanel: () => <div data-testid="tax-breakdown-panel" />,
}));

vi.mock("./DownloadInvoiceButton", () => ({
  DownloadInvoiceButton: () => <div data-testid="download-invoice-button" />,
}));

describe("ReceiptPanel - Order Details Gift Message Attachment", () => {
  const baseOrder: Order = {
    id: "ord-receipt-123",
    delegationId: "del-abc",
    merchantId: "merch-xyz",
    status: "approved",
    totalStroops: 1000000000n,
    lineItems: [
      {
        productId: "item-1",
        quantity: 1,
        unitPriceStroops: 1000000000n,
      },
    ],
    createdAt: new Date("2026-06-01T10:00:00Z"),
    updatedAt: new Date("2026-06-01T10:00:00Z"),
  };

  it("renders order details without gift section when order is not a gift", () => {
    render(<ReceiptPanel order={baseOrder} />);

    expect(screen.getByText("ord-receipt-123")).toBeInTheDocument();
    expect(screen.queryByTestId("order-gift-details")).not.toBeInTheDocument();
    expect(screen.queryByTestId("order-gift-message")).not.toBeInTheDocument();
  });

  it("attaches and displays gift message and recipient name when order has giftOptions", () => {
    const giftOrder: Order = {
      ...baseOrder,
      giftOptions: {
        isGift: true,
        recipientName: "Diana Prince",
        giftMessage: "Happy holidays, Diana! Hope you enjoy this gift.",
        hidePackingSlipPrice: true,
      },
    };

    render(<ReceiptPanel order={giftOrder} />);

    expect(screen.getByTestId("order-gift-details")).toBeInTheDocument();
    expect(screen.getByTestId("gift-recipient-name")).toHaveTextContent("Diana Prince");
    expect(screen.getByTestId("order-gift-message")).toHaveTextContent(
      "Happy holidays, Diana! Hope you enjoy this gift."
    );
  });

  it("attaches gift message from order.metadata.giftOptions", () => {
    const giftOrderFromMetadata: Order = {
      ...baseOrder,
      metadata: {
        giftOptions: {
          isGift: true,
          recipientName: "Barry Allen",
          giftMessage: "Run Barry, run! Happy Birthday!",
          hidePackingSlipPrice: false,
        },
      },
    };

    render(<ReceiptPanel order={giftOrderFromMetadata} />);

    expect(screen.getByTestId("order-gift-details")).toBeInTheDocument();
    expect(screen.getByTestId("gift-recipient-name")).toHaveTextContent("Barry Allen");
    expect(screen.getByTestId("order-gift-message")).toHaveTextContent(
      "Run Barry, run! Happy Birthday!"
    );
  });
});
