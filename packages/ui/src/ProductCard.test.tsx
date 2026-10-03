import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductCard, type RecommendedProduct } from "./ProductCard";

const product: RecommendedProduct = {
  id: "prod-1",
  title: "Noise-cancelling headphones",
  description: "Over-ear, 30-hour battery.",
  priceStroops: "12500000",
  currency: "USDC",
  merchantAddress: "GABC",
  merchantRating: 4.5,
  imageUrl: "https://example.com/headphones.jpg",
  inStock: true,
};

function renderCard(overrides: Partial<RecommendedProduct> = {}) {
  const onSelect = vi.fn();
  const onReject = vi.fn();
  const merged = { ...product, ...overrides };
  const utils = render(
    <ProductCard product={merged} onSelect={onSelect} onReject={onReject} />,
  );
  return { ...utils, onSelect, onReject, product: merged };
}

describe("ProductCard", () => {
  it("renders the product title, description and merchant", () => {
    renderCard();

    expect(screen.getByText("Noise-cancelling headphones")).toBeInTheDocument();
    expect(screen.getByText("Over-ear, 30-hour battery.")).toBeInTheDocument();
    expect(screen.getByText("Merchant Rating")).toBeInTheDocument();
  });

  it("is exposed as an article labelled with the product title", () => {
    renderCard();

    expect(screen.getByRole("article", { name: "Product: Noise-cancelling headphones" })).toBeInTheDocument();
  });

  it("lets the caller override the accessible name", () => {
    render(<ProductCard product={product} onSelect={vi.fn()} onReject={vi.fn()} ariaLabel="Recommended item" />);

    expect(screen.getByRole("article", { name: "Recommended item" })).toBeInTheDocument();
  });

  it("derives a stable id from the product when none is supplied", () => {
    const { container } = renderCard();

    expect(container.querySelector("#product-card-prod-1")).toBeInTheDocument();
  });

  it("keeps a caller-supplied id", () => {
    const { container } = render(
      <ProductCard id="custom-id" product={product} onSelect={vi.fn()} onReject={vi.fn()} />,
    );

    expect(container.querySelector("#custom-id")).toBeInTheDocument();
  });

  it("formats the price from stroops and shows the currency", () => {
    renderCard();

    expect(screen.getByText("1.25")).toBeInTheDocument();
    expect(screen.getByText("(USDC)")).toBeInTheDocument();
  });

  it("renders the product image with the title as alt text", () => {
    const { container } = renderCard();

    const image = container.querySelector("img")!;
    expect(image).toHaveAttribute("src", "https://example.com/headphones.jpg");
    expect(image).toHaveAttribute("alt", "Noise-cancelling headphones");
  });

  it("swaps in a placeholder when the image fails to load", () => {
    const { container } = renderCard();

    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector("img")!.getAttribute("src")).toContain("data:image/svg+xml");
  });

  it("renders a whole-star rating for a full score", () => {
    const { container } = renderCard({ merchantRating: 3 });

    const stars = container.textContent!;
    expect(stars).toContain("★★★");
    expect(stars).not.toContain("⯨");
    expect(stars).toContain("(3.0)");
  });

  it("renders a half star for a .5 rating", () => {
    const { container } = renderCard({ merchantRating: 4.5 });

    expect(container.textContent).toContain("★★★★");
    expect(container.textContent).toContain("⯨");
    expect(container.textContent).toContain("(4.5)");
  });

  it("calls onSelect with the product id when Buy is pressed", () => {
    const { onSelect } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Buy Noise-cancelling headphones with agent" }));

    expect(onSelect).toHaveBeenCalledWith("prod-1");
  });

  it("calls onReject with the product id when Skip is pressed", () => {
    const { onReject } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Skip Noise-cancelling headphones" }));

    expect(onReject).toHaveBeenCalledWith("prod-1");
  });

  it("marks the card out of stock and disables buying", () => {
    const { onSelect } = renderCard({ inStock: false });

    expect(screen.getByText("Out of Stock")).toBeInTheDocument();
    const buy = screen.getByRole("button", { name: /with agent/ });
    expect(buy).toBeDisabled();

    fireEvent.click(buy);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps Skip available for an out-of-stock product", () => {
    renderCard({ inStock: false });

    expect(screen.getByRole("button", { name: /^Skip/ })).toBeEnabled();
  });

  it("highlights the buy button on hover only while in stock", () => {
    const inStock = renderCard();
    const buy = screen.getByRole("button", { name: /with agent/ });

    fireEvent.mouseEnter(buy);
    expect(buy.style.background).toBe("rgb(29, 78, 216)");
    fireEvent.mouseLeave(buy);
    expect(buy.style.background).toBe("rgb(37, 99, 235)");

    inStock.unmount();

    renderCard({ inStock: false });
    const disabledBuy = screen.getByRole("button", { name: /with agent/ });
    const before = disabledBuy.style.background;
    fireEvent.mouseEnter(disabledBuy);
    expect(disabledBuy.style.background).toBe(before);
  });

  it("highlights the skip button on hover and restores it on leave", () => {
    renderCard();
    const skip = screen.getByRole("button", { name: /^Skip/ });

    fireEvent.mouseEnter(skip);
    expect(skip.style.background).toBe("rgb(249, 250, 251)");
    fireEvent.mouseLeave(skip);
    expect(skip.style.background).toBe("transparent");
  });

  it("forwards extra div props to the card", () => {
    const { container } = render(
      <ProductCard
        product={product}
        onSelect={vi.fn()}
        onReject={vi.fn()}
        data-testid="card"
        className="card--wide"
      />,
    );

    const card = container.querySelector('[data-testid="card"]')!;
    expect(card).toHaveClass("card--wide");
  });

  it("lets caller styles override the card chrome", () => {
    const { container } = render(
      <ProductCard
        product={product}
        onSelect={vi.fn()}
        onReject={vi.fn()}
        style={{ maxWidth: "800px" }}
      />,
    );

    const card = container.querySelector('[role="article"]') as HTMLElement;
    expect(card.style.maxWidth).toBe("800px");
  });
});
