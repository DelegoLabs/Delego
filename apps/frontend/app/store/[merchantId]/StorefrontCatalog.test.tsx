import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { StorefrontCatalog } from "./StorefrontCatalog";

vi.mock("../../../hooks/useCart", () => ({
  useCart: () => ({ addItem: vi.fn(), openDrawer: vi.fn(), summary: { totalQuantity: 0 } }),
}));
vi.mock("../../../components/storefront/StockDepletionPanel", () => ({
  StockDepletionPanel: () => null,
}));

class IntersectionObserverMock {
  static instances: IntersectionObserverMock[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  constructor(private readonly callback: IntersectionObserverCallback) { IntersectionObserverMock.instances.push(this); }
  trigger() { this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
}

const products = Array.from({ length: 13 }, (_, index) => ({
  id: `product-${index + 1}`,
  name: `Product ${index + 1}`,
  description: "Description",
  priceStroops: "10000000",
  active: true,
}));

describe("StorefrontCatalog infinite scrolling", () => {
  beforeEach(() => {
    IntersectionObserverMock.instances = [];
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    vi.stubGlobal("scrollTo", vi.fn());
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders an initial page, appends the next products, and ends the catalog", async () => {
    render(<StorefrontCatalog products={products} merchantId="merchant" merchantName="Merchant" payoutAddress="GABC" />);
    expect(screen.getByText("Product 12")).toBeInTheDocument();
    expect(screen.queryByText("Product 13")).not.toBeInTheDocument();

    await act(async () => IntersectionObserverMock.instances[0].trigger());
    expect(screen.getByLabelText("Loading more products")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Product 13")).toBeInTheDocument());
    expect(screen.getByText("Product 1")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("end of this catalog");
  });

  it("resets the visible page when the search changes", () => {
    render(<StorefrontCatalog products={products} merchantId="merchant" merchantName="Merchant" payoutAddress="GABC" />);
    const input = screen.getByLabelText("Search products");
    fireEvent.change(input, { target: { value: "Product 13" } });
    expect(screen.getByText("Product 13")).toBeInTheDocument();
    expect(screen.queryByText("Product 12")).not.toBeInTheDocument();
  });

  it("restores a saved catalog position after enough cards are rendered", async () => {
    sessionStorage.setItem("delego:storefront-catalog:merchant", JSON.stringify({ displayedCount: 13, scrollY: 480 }));
    render(<StorefrontCatalog products={products} merchantId="merchant" merchantName="Merchant" payoutAddress="GABC" />);
    await act(async () => {});
    expect(screen.getByText("Product 13")).toBeInTheDocument();
  });
});
