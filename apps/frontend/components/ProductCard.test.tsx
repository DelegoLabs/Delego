import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductCard, type RecommendedProduct } from "./ProductCard";

const mockProduct: RecommendedProduct = {
  id: "prod-1",
  title: "Mechanical Keyboard",
  description: "A high-quality mechanical keyboard with blue switches.",
  priceStroops: "5000000",
  currency: "USDC",
  merchantAddress: "GB7SE5D6E3P7KZKD3I4U3R5M6N7L8J9K",
  merchantRating: 4.5,
  imageUrl: "https://example.com/keyboard.jpg",
  inStock: true,
};

describe("ProductCard", () => {
  it("renders product information correctly", () => {
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();

    render(
      <ProductCard
        product={mockProduct}
        onSelect={onSelect}
        onQuickAdd={onQuickAdd}
      />
    );

    expect(screen.getByText("Mechanical Keyboard")).toBeInTheDocument();
    expect(screen.getByText("A high-quality mechanical keyboard with blue switches.")).toBeInTheDocument();
    expect(screen.getByText("$5.0K")).toBeInTheDocument();
    expect(screen.getByText("Buy with Agent")).toBeInTheDocument();
    expect(screen.getByText("Skip")).toBeInTheDocument();
  });

  it("handles user interactions for select and quick add", () => {
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();

    render(
      <ProductCard
        product={mockProduct}
        onSelect={onSelect}
        onQuickAdd={onQuickAdd}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Buy Mechanical Keyboard with agent/i }));
    expect(onSelect).toHaveBeenCalledWith("prod-1");

    fireEvent.click(screen.getByRole("button", { name: /Skip Mechanical Keyboard/i }));
    expect(onQuickAdd).toHaveBeenCalledWith("prod-1");
  });

  it("disables buy button when out of stock", () => {
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();

    render(
      <ProductCard
        product={{ ...mockProduct, inStock: false }}
        onSelect={onSelect}
        onQuickAdd={onQuickAdd}
      />
    );

    expect(screen.getByText("Out of Stock")).toBeInTheDocument();
    const buyButton = screen.getByRole("button", { name: /Buy Mechanical Keyboard with agent/i });
    expect(buyButton).toBeDisabled();
  });

  it("applies custom inline style if provided", () => {
    const { container } = render(
      <ProductCard
        product={mockProduct}
        onSelect={vi.fn()}
        onQuickAdd={vi.fn()}
        style={{ marginTop: "20px" }}
      />
    );

    const article = container.querySelector("div[role='article']");
    expect(article).toHaveStyle({ marginTop: "20px" });
  });
});
