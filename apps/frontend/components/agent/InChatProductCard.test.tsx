import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  InChatProductCard,
  type InChatProductCardProps,
} from "./InChatProductCard";

const PRODUCT: Omit<InChatProductCardProps, "onBuyNow"> = {
  productId: "prod-42",
  title: "Mechanical Keyboard",
  priceStroops: 42_000_000n, // 4.20 XLM
  imageUrl: "https://cdn.example.com/keyboard.jpg",
  stockQuantity: 12,
};

function renderCard(overrides: Partial<InChatProductCardProps> = {}) {
  const onBuyNow = overrides.onBuyNow ?? vi.fn();
  const props: InChatProductCardProps = { ...PRODUCT, ...overrides, onBuyNow };
  const utils = render(<InChatProductCard {...props} />);
  return { ...utils, onBuyNow, props };
}

function buyButton() {
  return screen.getByTestId("in-chat-product-buy-button");
}

describe("InChatProductCard — display", () => {
  it("renders the product title, price, and image from props", () => {
    renderCard();

    expect(screen.getByTestId("in-chat-product-card")).toHaveAttribute(
      "data-product-id",
      "prod-42"
    );
    expect(screen.getByTestId("in-chat-product-title")).toHaveTextContent(
      "Mechanical Keyboard"
    );
    expect(screen.getByTestId("in-chat-product-price")).toHaveTextContent(
      "4.20 XLM"
    );

    const image = screen.getByTestId("in-chat-product-image");
    expect(image).toHaveAttribute(
      "src",
      "https://cdn.example.com/keyboard.jpg"
    );
    expect(image).toHaveAttribute("alt", "Mechanical Keyboard");
  });

  it("labels the card as a product recommendation for screen readers", () => {
    renderCard();
    expect(
      screen.getByRole("region", {
        name: "Product recommendation: Mechanical Keyboard",
      })
    ).toBeInTheDocument();
  });

  it("falls back to a placeholder image when the thumbnail fails to load", () => {
    renderCard();
    fireEvent.error(screen.getByTestId("in-chat-product-image"));
    expect(screen.getByTestId("in-chat-product-image")).toHaveAttribute(
      "src",
      expect.stringContaining("No Image")
    );
  });
});

describe("InChatProductCard — stock badge", () => {
  it("shows an in-stock badge when stock is plentiful", () => {
    renderCard({ stockQuantity: 12 });
    expect(screen.getByTestId("in-chat-product-stock-badge")).toHaveTextContent(
      "In stock"
    );
  });

  it("shows a low-stock badge with the remaining count", () => {
    renderCard({ stockQuantity: 3 });
    expect(screen.getByTestId("in-chat-product-stock-badge")).toHaveTextContent(
      "Only 3 left"
    );
  });

  it("shows an out-of-stock badge and disables checkout when sold out", async () => {
    const user = userEvent.setup();
    const { onBuyNow } = renderCard({ stockQuantity: 0 });

    expect(screen.getByTestId("in-chat-product-stock-badge")).toHaveTextContent(
      "Out of stock"
    );
    expect(buyButton()).toBeDisabled();

    await user.click(buyButton());
    expect(onBuyNow).not.toHaveBeenCalled();
  });

  it("omits the badge when stock is untracked", () => {
    renderCard({ stockQuantity: undefined });
    expect(
      screen.queryByTestId("in-chat-product-stock-badge")
    ).not.toBeInTheDocument();
    expect(buyButton()).toBeEnabled();
  });
});

describe("InChatProductCard — buy-now interaction", () => {
  it("triggers onBuyNow with the product id on a single click", async () => {
    const user = userEvent.setup();
    const { onBuyNow } = renderCard();

    await user.click(buyButton());

    expect(onBuyNow).toHaveBeenCalledTimes(1);
    expect(onBuyNow).toHaveBeenCalledWith("prod-42");
  });

  it("marks the order as placed once the checkout resolves", async () => {
    const user = userEvent.setup();
    renderCard({ onBuyNow: vi.fn().mockResolvedValue(undefined) });

    await user.click(buyButton());

    expect(
      await screen.findByTestId("in-chat-product-ordered-badge")
    ).toHaveTextContent("Order placed");
    expect(buyButton()).toHaveTextContent("Purchased");
    expect(buyButton()).toBeDisabled();
  });
});

describe("InChatProductCard — loading state", () => {
  it("disables the button and announces progress while checkout is pending", async () => {
    const user = userEvent.setup();
    let resolveCheckout!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveCheckout = resolve;
    });

    renderCard({ onBuyNow: vi.fn(() => pending) });
    await user.click(buyButton());

    expect(buyButton()).toBeDisabled();
    expect(buyButton()).toHaveAttribute("aria-busy", "true");
    expect(buyButton()).toHaveTextContent("Buying…");
    expect(screen.getByTestId("in-chat-product-status")).toHaveTextContent(
      "Placing your order…"
    );

    resolveCheckout();
    await waitFor(() => expect(buyButton()).toHaveTextContent("Purchased"));
    expect(buyButton()).toHaveAttribute("aria-busy", "false");
    expect(screen.getByTestId("in-chat-product-status")).not.toHaveTextContent(
      "Placing your order…"
    );
  });

  it("does not fire onBuyNow again while a checkout is in flight", async () => {
    const user = userEvent.setup();
    let resolveCheckout!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveCheckout = resolve;
    });
    const onBuyNow = vi.fn(() => pending);

    renderCard({ onBuyNow });
    await user.click(buyButton());
    expect(buyButton()).toBeDisabled();

    await user.click(buyButton());
    expect(onBuyNow).toHaveBeenCalledTimes(1);

    resolveCheckout();
    await waitFor(() => expect(buyButton()).toHaveTextContent("Purchased"));
  });
});

describe("InChatProductCard — failure handling", () => {
  it("surfaces an alert and keeps the card retryable when checkout fails", async () => {
    const user = userEvent.setup();
    const onBuyNow = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(undefined);

    renderCard({ onBuyNow });

    await user.click(buyButton());
    const alert = await screen.findByTestId("in-chat-product-purchase-error");
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveTextContent(/purchase failed/i);
    expect(buyButton()).toBeEnabled();
    expect(buyButton()).toHaveTextContent("Buy now");

    await user.click(buyButton());
    expect(onBuyNow).toHaveBeenCalledTimes(2);

    expect(
      await screen.findByTestId("in-chat-product-ordered-badge")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("in-chat-product-purchase-error")
    ).not.toBeInTheDocument();
  });
});
