import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider, useCart } from "../../hooks/useCart";
import { CART_STORAGE_KEY, type CartItem } from "../../lib/cart";
import type { ServerProductSnapshot } from "../../lib/cartConflicts";
import { CartConflictModal } from "../CartConflictModal";

const cachedItems: CartItem[] = [
  {
    productId: "lamp",
    merchantId: "m1",
    merchantName: "Merchant",
    payoutAddress: "GDEST",
    title: "Desk lamp",
    priceStroops: "10000000",
    quantity: 1,
    maxStock: 5,
  },
  {
    productId: "mug",
    merchantId: "m1",
    merchantName: "Merchant",
    payoutAddress: "GDEST",
    title: "Mug",
    priceStroops: "20000000",
    quantity: 4,
    maxStock: 10,
  },
];

function Probe() {
  const { summary, canCheckout } = useCart();
  return (
    <>
      <output data-testid="items">
        {summary.items
          .map((i) => `${i.productId}:${i.priceStroops}x${i.quantity}`)
          .join(",")}
      </output>
      <button type="button" disabled={!canCheckout}>
        Checkout
      </button>
      <CartConflictModal />
    </>
  );
}

function renderCart(server: ServerProductSnapshot[]) {
  const fetchServerSnapshot = vi.fn().mockResolvedValue(server);
  render(
    <CartProvider fetchServerSnapshot={fetchServerSnapshot}>
      <Probe />
    </CartProvider>
  );
  return { fetchServerSnapshot };
}

async function goOnline() {
  await waitFor(() =>
    expect(screen.getByTestId("items")).toHaveTextContent("lamp")
  );
  await act(async () => {
    window.dispatchEvent(new Event("online"));
  });
}

beforeEach(() => {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cachedItems));
});

afterEach(() => {
  window.localStorage.clear();
});

describe("CartConflictModal", () => {
  it("stays hidden and allows checkout when nothing changed offline", async () => {
    const { fetchServerSnapshot } = renderCart([
      { productId: "lamp", priceStroops: "10000000", availableStock: 5 },
      { productId: "mug", priceStroops: "20000000", availableStock: 10 },
    ]);
    await goOnline();
    await waitFor(() => expect(fetchServerSnapshot).toHaveBeenCalled());
    expect(screen.queryByTestId("cart-conflict-modal")).toBeNull();
    expect(screen.getByRole("button", { name: "Checkout" })).toBeEnabled();
  });

  it("blocks checkout until offline price and stock changes are resolved", async () => {
    renderCart([
      { productId: "lamp", priceStroops: "15000000", availableStock: 5 },
      { productId: "mug", priceStroops: "20000000", availableStock: 2 },
    ]);
    await goOnline();

    const modal = await screen.findByTestId("cart-conflict-modal");
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId("cart-conflict-lamp")).toHaveAttribute(
      "data-conflict-type",
      "price_changed"
    );
    expect(screen.getByTestId("cart-conflict-mug")).toHaveAttribute(
      "data-conflict-type",
      "insufficient_quantity"
    );
    expect(screen.getByRole("button", { name: "Checkout" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Accept New Price" }));
    expect(screen.getByTestId("items")).toHaveTextContent("lamp:15000000x1");
    // One conflict left — checkout is still blocked.
    expect(screen.getByRole("button", { name: "Checkout" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Reduce to 2" }));
    expect(screen.getByTestId("items")).toHaveTextContent("mug:20000000x2");
    expect(screen.queryByTestId("cart-conflict-modal")).toBeNull();
    expect(screen.getByRole("button", { name: "Checkout" })).toBeEnabled();
  });

  it("offers only removal for items that sold out offline", async () => {
    renderCart([
      { productId: "lamp", priceStroops: "10000000", availableStock: 0 },
      { productId: "mug", priceStroops: "20000000", availableStock: 10 },
    ]);
    await goOnline();

    await screen.findByTestId("cart-conflict-lamp");
    expect(screen.queryByRole("button", { name: "Accept New Price" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove Desk lamp" }));

    expect(screen.getByTestId("items")).toHaveTextContent("mug:20000000x4");
    expect(screen.getByTestId("items")).not.toHaveTextContent("lamp");
    expect(screen.getByRole("button", { name: "Checkout" })).toBeEnabled();
  });

  it("keeps checkout available when the live lookup fails", async () => {
    const fetchServerSnapshot = vi.fn().mockRejectedValue(new Error("offline"));
    render(
      <CartProvider fetchServerSnapshot={fetchServerSnapshot}>
        <Probe />
      </CartProvider>
    );
    await goOnline();
    await waitFor(() => expect(fetchServerSnapshot).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Checkout" })).toBeEnabled()
    );
    expect(screen.queryByTestId("cart-conflict-modal")).toBeNull();
  });
});
