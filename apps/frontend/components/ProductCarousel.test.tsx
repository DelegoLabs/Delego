import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductCarousel } from "./ProductCarousel";

const mockProducts: import("../packages/ui/src/ProductCard").RecommendedProduct[] = [
  {
    id: "prod-1",
    title: "Mechanical Keyboard",
    description: "A high-quality mechanical keyboard with blue switches.",
    priceStroops: "5000000",
    currency: "USDC",
    merchantAddress: "GB7SE5D6E3P7KZKD3I4U3R5M6N7L8J9K",
    merchantRating: 4.5,
    imageUrl: "https://example.com/keyboard.jpg",
    inStock: true,
  },
  {
    id: "prod-2",
    title: "Ergonomic Mouse",
    description: "A comfortable ergonomic mouse for right-handed users.",
    priceStroops: "3000000",
    currency: "USDC",
    merchantAddress: "GB7SE5D6E3P7KZKD3I4U3R5M6N7L8J9K",
    merchantRating: 4.2,
    imageUrl: "https://example.com/mouse.jpg",
    inStock: true,
  },
  {
    id: "prod-3",
    title: "Monitor 27-inch",
    description: "A 27-inch 4K monitor with IPS panel.",
    priceStroops: "15000000",
    currency: "USDC",
    merchantAddress: "GB7SE5D6E3P7KZKD3I4U3R5M6N7L8J9K",
    merchantRating: 4.8,
    imageUrl: "https://example.com/monitor.jpg",
    inStock: true,
  },
  {
    id: "prod-4",
    title: "Headphones Wireless",
    description: "Noise-cancelling wireless headphones with 30hr battery.",
    priceStroops: "8000000",
    currency: "USDC",
    merchantAddress: "GB7SE5D6E3P7KZKD3I4U3R5M6N7L8J9K",
    merchantRating: 4.3,
    imageUrl: "https://example.com/headphones.jpg",
    inStock: true,
  },
  {
    id: "prod-5",
    title: "Gaming Laptop",
    description: "A powerful gaming laptop with RTX 4060.",
    priceStroops: "50000000",
    currency: "USDC",
    merchantAddress: "GB7SE5D6E3P7KZKD3I4U3R5M6N7L8J9K",
    merchantRating: 4.7,
    imageUrl: "https://example.com/laptop.jpg",
    inStock: false,
  },
];

describe("ProductCarousel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders product cards when products are provided", () => {
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();
    render(
      <ProductCarousel
        products={mockProducts}
        onSelect={onSelect}
        onQuickAdd={onQuickAdd}
      />
    );
    const cards = screen.getAllByRole("article");
    expect(cards.length).toBeGreaterThan(0);
  });

  it("renders correct number of visible products", () => {
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();
    render(
      <ProductCarousel
        products={mockProducts}
        onSelect={onSelect}
        onQuickAdd={onQuickAdd}
      />
    );
    const visibleCards = screen.getAllByRole("article");
    expect(visibleCards.length).toBeLessThanOrEqual(3);
  });

  it("handles product selection", () => {
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();
    render(
      <ProductCarousel
        products={mockProducts.slice(0, 1)} // Only 1 product for this test
        onSelect={onSelect}
        onQuickAdd={onQuickAdd}
      />
    );
    const firstCard = screen.getByRole("article");
    const buyButton = firstCard.querySelector("button[aria-label*='Buy']");
    expect(buyButton).toBeInTheDocument();
    fireEvent.click(buyButton);
    expect(onSelect).toHaveBeenCalledWith("prod-1");
  });

  it("handles quick add action", () => {
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();
    render(
      <ProductCarousel
        products={mockProducts.slice(0, 1)}
        onSelect={onSelect}
        onQuickAdd={onQuickAdd}
      />
    );
    const firstCard = screen.getByRole("article");
    const skipButton = firstCard.querySelector("button[aria-label*='Skip']");
    expect(skipButton).toBeInTheDocument();
    fireEvent.click(skipButton);
    expect(onQuickAdd).toHaveBeenCalledWith("prod-1");
  });

  it("shows out of stock badge when product is out of stock", () => {
    const outOfStockProduct = {
      ...mockProducts[4],
      inStock: false,
    };
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();
    render(
      <ProductCarousel
        products={[outOfStockProduct]}
        onSelect={onSelect}
        onQuickAdd={onQuickAdd}
      />
    );
    const outOfStockBadge = screen.getByText("Out of Stock");
    expect(outOfStockBadge).toBeInTheDocument();
  });

  it("renders pagination dots", () => {
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();
    render(
      <ProductCarousel
        products={mockProducts}
        onSelect={onSelect}
        onQuickAdd={onQuickAdd}
      />
    );
    const paginationButtons = screen.getAllByRole("button", {
      name: /Go to page \d+/,
    });
    expect(paginationButtons.length).toBeGreaterThan(0);
  });

  it("renders prev/next arrows on desktop", () => {
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();
    render(
      <ProductCarousel
        products={mockProducts}
        onSelect={onSelect}
        onQuickAdd={onQuickAdd}
      />
    );
    // Buttons exist in DOM but are hidden via display:none when viewport < 768px
    // jsdom doesn't evaluate CSS media queries, so they're always hidden in test env
    const prevArrow = document.querySelector("button[aria-label='Previous page']");
    const nextArrow = document.querySelector("button[aria-label='Next page']");
    expect(prevArrow).not.toBeNull();
    expect(nextArrow).not.toBeNull();
  });
});