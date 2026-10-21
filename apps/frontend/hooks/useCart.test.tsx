import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CartProvider, useCart } from "./useCart";

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  listeners = new Set<(event: MessageEvent<unknown>) => void>();
  postMessage = vi.fn();

  constructor(readonly name: string) {
    MockBroadcastChannel.instances.push(this);
  }

  addEventListener(
    _type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ) {
    this.listeners.add(listener);
  }

  emit(data: unknown) {
    for (const listener of this.listeners) {
      listener({ data } as MessageEvent<unknown>);
    }
  }
}

function CartProbe() {
  const { summary, addItem } = useCart();
  return (
    <>
      <output data-testid="cart-items">
        {summary.items
          .map((item) => `${item.title}:${item.quantity}`)
          .join(",")}
      </output>
      <button
        type="button"
        onClick={() =>
          addItem({
            productId: "local-item",
            merchantId: "merchant",
            merchantName: "Merchant",
            payoutAddress: "GDEST",
            title: "Local item",
            priceStroops: "1000000",
            quantity: 1,
            maxStock: 5,
          })
        }
      >
        Add locally
      </button>
    </>
  );
}

describe("CartProvider tab synchronization", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("broadcasts local changes and applies cart updates from another tab", async () => {
    Object.defineProperty(window, "BroadcastChannel", {
      configurable: true,
      value: MockBroadcastChannel,
    });
    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("cart-items")).toBeEmptyDOMElement()
    );
    const channel = MockBroadcastChannel.instances.at(-1)!;
    act(() => screen.getByRole("button", { name: "Add locally" }).click());

    expect(channel.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CART_UPDATED",
        payload: {
          items: [expect.objectContaining({ productId: "local-item" })],
        },
      })
    );

    act(() => {
      channel.emit({
        type: "CART_UPDATED",
        senderTabId: "another-tab",
        payload: {
          items: [
            {
              productId: "remote-item",
              merchantId: "merchant",
              merchantName: "Merchant",
              payoutAddress: "GDEST",
              title: "Remote item",
              priceStroops: "2000000",
              quantity: 2,
              maxStock: 5,
            },
          ],
        },
      });
    });

    expect(screen.getByTestId("cart-items")).toHaveTextContent("Remote item:2");
    await waitFor(() => {
      expect(
        JSON.parse(window.localStorage.getItem("delego_cart_items") ?? "[]")
      ).toEqual([expect.objectContaining({ productId: "remote-item" })]);
    });
  });
});
