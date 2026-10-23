import { useEffect } from "react";
import { act, render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider, useCart } from "../../hooks/useCart";
import { CartDrawer } from "./CartDrawer";
import { validatePromoCode, type PromoCodeDiscount } from "../../lib/promoCode";

vi.mock("../../lib/promoCode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/promoCode")>()),
  validatePromoCode: vi.fn(),
}));

const discount: PromoCodeDiscount = {
  code: "SUMMER10",
  discountType: "percentage",
  discountValue: 10,
  appliedDiscountStroops: "10000000",
};

function OpenCart() {
  const { addItem, openDrawer, hydrated } = useCart();
  useEffect(() => {
    if (!hydrated) return;
    addItem({
      productId: "tea",
      merchantId: "tea-shop",
      merchantName: "Tea Shop",
      payoutAddress: "GTEA",
      title: "Tea",
      priceStroops: "100000000",
      quantity: 1,
      maxStock: 5,
    });
    openDrawer();
  }, [addItem, openDrawer, hydrated]);
  return <CartDrawer />;
}

async function setup() {
  const user = userEvent.setup();
  render(
    <CartProvider>
      <OpenCart />
    </CartProvider>
  );
  await screen.findByRole("textbox", { name: "Promo code" });
  await user.type(
    screen.getByRole("textbox", { name: "Promo code" }),
    "SUMMER10"
  );
  return user;
}

describe("cart coupon flow", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(validatePromoCode).mockReset();
  });
  afterEach(cleanup);

  it("applies and removes a discount, then passes the net amount into checkout", async () => {
    vi.mocked(validatePromoCode).mockResolvedValue(discount);
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText(/SUMMER10/);
    expect(screen.getByTestId("cart-subtotal")).toHaveTextContent("9 XLM");
    await user.click(screen.getByRole("button", { name: "Remove promo code" }));
    expect(screen.getByTestId("cart-subtotal")).toHaveTextContent("10 XLM");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(screen.getByTestId("cart-subtotal")).toHaveTextContent("9 XLM")
    );
    await user.click(screen.getByTestId("proceed-to-checkout"));
    expect(
      screen.getByRole("region", { name: "Multi-merchant checkout" })
    ).toHaveTextContent("9.00 XLM");
  });

  it.each(["Invalid coupon code.", "This coupon has expired."])(
    "shows %s without changing the subtotal",
    async (message) => {
      vi.mocked(validatePromoCode).mockRejectedValue(new Error(message));
      const user = await setup();
      await user.click(screen.getByRole("button", { name: "Apply" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByTestId("cart-subtotal")).toHaveTextContent("10 XLM");
    }
  );

  it("removes an applied quote immediately when the quantity changes", async () => {
    vi.mocked(validatePromoCode).mockResolvedValue(discount);
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByRole("button", { name: "Remove promo code" });
    await user.click(
      screen.getByRole("button", { name: "Increase quantity of Tea" })
    );
    await waitFor(() =>
      expect(screen.getByTestId("cart-subtotal")).toHaveTextContent("20 XLM")
    );
    expect(
      screen.queryByRole("button", { name: "Remove promo code" })
    ).not.toBeInTheDocument();
  });

  it("ignores a late response for a changed cart and blocks checkout during validation", async () => {
    let resolve!: (value: PromoCodeDiscount) => void;
    vi.mocked(validatePromoCode).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByTestId("proceed-to-checkout")).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Increase quantity of Tea" })
    );
    await waitFor(() =>
      expect(screen.getByTestId("cart-subtotal")).toHaveTextContent("20 XLM")
    );
    await act(async () => resolve(discount));
    expect(screen.getByTestId("cart-subtotal")).toHaveTextContent("20 XLM");
    expect(
      screen.queryByRole("button", { name: "Remove promo code" })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("proceed-to-checkout")).toBeEnabled();
  });

  it("shows a retryable message when verification cannot reach the backend", async () => {
    vi.mocked(validatePromoCode).mockRejectedValue(
      new TypeError("Failed to fetch")
    );
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check your connection"
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
  });
});
