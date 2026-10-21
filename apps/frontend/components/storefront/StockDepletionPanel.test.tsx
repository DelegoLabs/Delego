import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StockDepletionPanel } from "./StockDepletionPanel";
import { StorefrontCatalog } from "../../app/store/[merchantId]/StorefrontCatalog";
import {
  fetchStockDepletion,
  type StockDepletionInfo,
} from "../../lib/stockDepletion";

vi.mock("@delegolabs/ui", () => ({
  formatAmount: () => ({ value: "1", symbol: "XLM" }),
}));
vi.mock("../../hooks/useCart", () => ({
  useCart: () => ({
    addItem: vi.fn(),
    openDrawer: vi.fn(),
    summary: { totalQuantity: 0 },
  }),
}));
vi.mock("../../lib/stockDepletion", async (original) => ({
  ...(await original<typeof import("../../lib/stockDepletion")>()),
  fetchStockDepletion: vi.fn(),
}));

const stock = (remainingStock: number): StockDepletionInfo => ({
  productId: "product-1",
  remainingStock,
  reservedStock: 0,
  allowBackorder: false,
  restockWaitlistCount: 0,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("StockDepletionPanel", () => {
  it("retains the same badge slot from loading through every stock phase", () => {
    const { rerender } = render(
      <StockDepletionPanel merchantId="merchant" stock={null} mode="card" />
    );
    const slot = screen.getByTestId("stock-badge-slot");
    expect(slot).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("stock-skeleton")).toBeInTheDocument();
    for (const value of [
      stock(12),
      stock(3),
      stock(0),
      { ...stock(0), allowBackorder: true },
    ]) {
      rerender(
        <StockDepletionPanel merchantId="merchant" stock={value} mode="card" />
      );
      expect(screen.getByTestId("stock-badge-slot")).toBe(slot);
      expect(slot).toHaveAttribute("aria-busy", "false");
      expect(screen.queryByTestId("stock-skeleton")).not.toBeInTheDocument();
    }
  });

  it("keeps the reservation when shimmer is disabled or a query has no result", () => {
    const { rerender } = render(
      <StockDepletionPanel
        merchantId="merchant"
        stock={null}
        mode="detail"
        showSkeletonWhileLoading={false}
      />
    );
    const slot = screen.getByTestId("stock-badge-slot");
    expect(screen.queryByTestId("stock-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("stock-countdown")).toHaveTextContent(
      "Checking stock"
    );
    rerender(
      <StockDepletionPanel
        merchantId="merchant"
        stock={null}
        loading={false}
        mode="detail"
      />
    );
    expect(screen.getByTestId("stock-badge-slot")).toBe(slot);
    expect(slot).toHaveAttribute("aria-busy", "false");
    expect(screen.getByTestId("stock-countdown")).toHaveTextContent(
      "Stock unavailable"
    );
  });

  it("does not expand the restock form when an async result is out of stock", () => {
    const { rerender, container } = render(
      <StockDepletionPanel merchantId="merchant" stock={null} mode="card" />
    );
    const disclosure = container.querySelector("details");
    rerender(
      <StockDepletionPanel merchantId="merchant" stock={stock(0)} mode="card" />
    );
    expect(container.querySelector("details")).toBe(disclosure);
    expect(disclosure).not.toHaveAttribute("open");
    expect(screen.getByTestId("stock-depletion-badge")).toHaveTextContent(
      "Out of Stock"
    );
    fireEvent.click(screen.getByText("Notify Me When Available"));
    expect(disclosure).toHaveAttribute("open");
  });

  it("ends the countdown highlight after a stock decrease", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <StockDepletionPanel
        merchantId="merchant"
        stock={stock(4)}
        mode="detail"
      />
    );
    rerender(
      <StockDepletionPanel
        merchantId="merchant"
        stock={stock(2)}
        mode="detail"
      />
    );
    expect(screen.getByTestId("stock-countdown")).toHaveTextContent("2 left");
    expect(screen.getByTestId("stock-countdown")).toHaveStyle({
      color: "#b91c1c",
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByTestId("stock-countdown")).toHaveStyle({
      color: "#111827",
    });
  });
});

describe("catalog inventory loading", () => {
  it.each([stock(0), null])(
    "mounts the reservation before the inventory promise resolves (%j)",
    async (result) => {
      let resolve!: (value: StockDepletionInfo | null) => void;
      vi.mocked(fetchStockDepletion).mockReturnValue(
        new Promise((done) => {
          resolve = done;
        })
      );
      render(
        <StorefrontCatalog
          products={[
            {
              id: "product-1",
              name: "Product",
              description: "",
              priceStroops: "1",
              active: true,
            },
          ]}
          merchantId="merchant"
          merchantName="Merchant"
          payoutAddress=""
        />
      );
      const slot = screen.getByTestId("stock-badge-slot");
      expect(screen.getByTestId("stock-skeleton")).toBeInTheDocument();
      await act(async () => {
        resolve(result);
      });
      expect(screen.getByTestId("stock-badge-slot")).toBe(slot);
      expect(slot).toHaveAttribute("aria-busy", "false");
      expect(screen.queryByTestId("stock-skeleton")).not.toBeInTheDocument();
      if (result)
        expect(screen.getByTestId("add-to-cart-product-1")).toBeDisabled();
    }
  );
});
