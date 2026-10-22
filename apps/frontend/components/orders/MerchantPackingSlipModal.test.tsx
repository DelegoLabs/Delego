import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MerchantPackingSlipModal } from "./MerchantPackingSlipModal";
import type { MerchantEscrowOrder } from "../../lib/merchantEscrowOrders";
import type { Order } from "@delegolabs/types";

describe("MerchantPackingSlipModal", () => {
  const baseOrder: MerchantEscrowOrder = {
    orderId: "ord-987654",
    escrowId: "escrow-1234",
    buyerAddress: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
    amountStroops: "500000000", // 50 XLM
    currency: "XLM",
    status: "funded",
    shippingAddress: "123 Main St, Apt 4B, Springfield, IL 62701",
    fundedAt: "2026-05-15T12:00:00.000Z",
    deadline: "2026-05-20T12:00:00.000Z",
    items: [
      { name: "Vintage Leather Jacket", quantity: 1, priceStroops: "500000000" },
    ],
  };

  it("does not render when isOpen is false", () => {
    render(<MerchantPackingSlipModal isOpen={false} order={baseOrder} onClose={vi.fn()} />);
    expect(screen.queryByTestId("merchant-packing-slip-modal")).not.toBeInTheDocument();
  });

  it("renders order information on packing slip", () => {
    render(<MerchantPackingSlipModal isOpen={true} order={baseOrder} onClose={vi.fn()} />);

    expect(screen.getByTestId("packing-slip-order-id")).toHaveTextContent("ord-987654");
    expect(screen.getByText(/123 Main St, Apt 4B/)).toBeInTheDocument();
    expect(screen.getByText("Vintage Leather Jacket")).toBeInTheDocument();
  });

  it("displays pricing when order is NOT a gift or hidePackingSlipPrice is false", () => {
    render(<MerchantPackingSlipModal isOpen={true} order={baseOrder} onClose={vi.fn()} />);

    // Table header should have Unit Price and Total columns
    expect(screen.getByTestId("packing-slip-th-price")).toBeInTheDocument();
    expect(screen.getByTestId("packing-slip-th-total")).toBeInTheDocument();
    expect(screen.getByTestId("packing-slip-totals")).toBeInTheDocument();
    expect(screen.getByTestId("packing-slip-total-amount")).toHaveTextContent("50.00 XLM");
    expect(screen.queryByTestId("packing-slip-price-hidden-notice")).not.toBeInTheDocument();
  });

  it("honors hide pricing request when hidePackingSlipPrice is true", () => {
    const giftOrder: MerchantEscrowOrder = {
      ...baseOrder,
      giftOptions: {
        isGift: true,
        recipientName: "Eleanor Vance",
        giftMessage: "Enjoy your vintage jacket! Love, Theo",
        hidePackingSlipPrice: true,
      },
    };

    render(<MerchantPackingSlipModal isOpen={true} order={giftOrder} onClose={vi.fn()} />);

    // Pricing elements must NOT exist
    expect(screen.queryByTestId("packing-slip-th-price")).not.toBeInTheDocument();
    expect(screen.queryByTestId("packing-slip-th-total")).not.toBeInTheDocument();
    expect(screen.queryByTestId("packing-slip-totals")).not.toBeInTheDocument();
    expect(screen.queryByTestId("packing-slip-total-amount")).not.toBeInTheDocument();

    // Price hidden notice must be displayed
    expect(screen.getByTestId("packing-slip-price-hidden-notice")).toBeInTheDocument();
    expect(screen.getByText(/Item prices and totals are hidden on this packing slip/)).toBeInTheDocument();

    // Gift section and details must be present
    expect(screen.getByTestId("packing-slip-gift-section")).toBeInTheDocument();
    expect(screen.getByTestId("packing-slip-recipient-name")).toHaveTextContent("Eleanor Vance");
    expect(screen.getByTestId("packing-slip-gift-message")).toHaveTextContent("Enjoy your vintage jacket! Love, Theo");
  });

  it("honors hide pricing request when gift options are passed in order.metadata.giftOptions", () => {
    const giftOrderWithMetadata: MerchantEscrowOrder = {
      ...baseOrder,
      metadata: {
        giftOptions: {
          isGift: true,
          recipientName: "Arthur Dent",
          giftMessage: "Don't panic! Here is your towel.",
          hidePackingSlipPrice: true,
        },
      },
    };

    render(<MerchantPackingSlipModal isOpen={true} order={giftOrderWithMetadata} onClose={vi.fn()} />);

    expect(screen.queryByTestId("packing-slip-th-price")).not.toBeInTheDocument();
    expect(screen.getByTestId("packing-slip-price-hidden-notice")).toBeInTheDocument();
    expect(screen.getByTestId("packing-slip-recipient-name")).toHaveTextContent("Arthur Dent");
    expect(screen.getByTestId("packing-slip-gift-message")).toHaveTextContent("Don't panic! Here is your towel.");
  });

  it("shows prices if isGift is true but hidePackingSlipPrice is false", () => {
    const giftOrderWithPricing: MerchantEscrowOrder = {
      ...baseOrder,
      giftOptions: {
        isGift: true,
        recipientName: "Alice",
        giftMessage: "Here is your gift!",
        hidePackingSlipPrice: false,
      },
    };

    render(<MerchantPackingSlipModal isOpen={true} order={giftOrderWithPricing} onClose={vi.fn()} />);

    // Pricing should still be rendered because hidePackingSlipPrice was unchecked
    expect(screen.getByTestId("packing-slip-th-price")).toBeInTheDocument();
    expect(screen.getByTestId("packing-slip-totals")).toBeInTheDocument();
    expect(screen.queryByTestId("packing-slip-price-hidden-notice")).not.toBeInTheDocument();

    // Gift message should still be visible
    expect(screen.getByTestId("packing-slip-recipient-name")).toHaveTextContent("Alice");
    expect(screen.getByTestId("packing-slip-gift-message")).toHaveTextContent("Here is your gift!");
  });

  it("supports Order domain model as well", () => {
    const standardOrder: Order = {
      id: "ord-standard-1",
      userId: "user-42",
      delegationId: "del-42",
      merchantId: "merch-1",
      status: "approved",
      totalStroops: 200000000n,
      lineItems: [
        { productId: "prod-xyz", quantity: 2, unitPriceStroops: 100000000n },
      ],
      createdAt: new Date("2026-04-10T10:00:00Z"),
      giftOptions: {
        isGift: true,
        recipientName: "Dana Scully",
        giftMessage: "The truth is out there.",
        hidePackingSlipPrice: true,
      },
    };

    render(<MerchantPackingSlipModal isOpen={true} order={standardOrder} onClose={vi.fn()} />);

    expect(screen.getByTestId("packing-slip-order-id")).toHaveTextContent("ord-standard-1");
    expect(screen.getByTestId("packing-slip-recipient-name")).toHaveTextContent("Dana Scully");
    expect(screen.getByTestId("packing-slip-gift-message")).toHaveTextContent("The truth is out there.");
    expect(screen.queryByTestId("packing-slip-th-price")).not.toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<MerchantPackingSlipModal isOpen={true} order={baseOrder} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText("Close packing slip"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("triggers window.print when print button is clicked", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<MerchantPackingSlipModal isOpen={true} order={baseOrder} onClose={vi.fn()} />);

    fireEvent.click(screen.getByTestId("print-packing-slip-btn"));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
