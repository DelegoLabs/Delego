import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MultiMerchantCheckout } from "./MultiMerchantCheckout";

const mockCartItems = [
  {
    productId: "prod-1",
    merchantId: "merchant-1",
    merchantName: "Acme Store",
    payoutAddress: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
    title: "Awesome Mug",
    priceStroops: "100000000",
    quantity: 1,
    maxStock: 5,
  },
];

vi.mock("../../hooks/useCart", () => ({
  useCart: () => ({
    summary: {
      items: mockCartItems,
      totalQuantity: 1,
      subtotalStroops: "100000000",
      itemCount: 1,
    },
    clearCart: vi.fn(),
  }),
}));

describe("MultiMerchantCheckout - Gift Options", () => {
  it("renders 'This is a gift' checkbox in checkout review step", () => {
    render(<MultiMerchantCheckout onCancel={vi.fn()} />);

    expect(screen.getByTestId("checkout-review-step")).toBeInTheDocument();
    const checkbox = screen.getByTestId("gift-options-checkbox");
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it("passes gift options metadata to signEscrow when authorizing escrow", async () => {
    const signEscrow = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();

    render(
      <MultiMerchantCheckout
        signEscrow={signEscrow}
        onComplete={onComplete}
      />
    );

    // Toggle gift checkbox
    fireEvent.click(screen.getByTestId("gift-options-checkbox"));

    // Enter recipient and gift message
    fireEvent.change(screen.getByTestId("gift-recipient-name-input"), {
      target: { value: "Bruce Wayne" },
    });
    fireEvent.change(screen.getByTestId("gift-message-textarea"), {
      target: { value: "Happy Birthday from Gotham!" },
    });

    // Click Authorize escrow inside act
    const authorizeBtn = screen.getByRole("button", { name: /Authorize escrow/i });
    await act(async () => {
      fireEvent.click(authorizeBtn);
    });

    expect(signEscrow).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: "merchant-1" }),
      {
        giftOptions: {
          isGift: true,
          recipientName: "Bruce Wayne",
          giftMessage: "Happy Birthday from Gotham!",
          hidePackingSlipPrice: true,
        },
      }
    );
  });
});
