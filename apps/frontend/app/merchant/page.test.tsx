import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MerchantDashboardRootPage from "./page";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockProducts = vi.fn();
vi.mock("../../hooks/useMerchantCatalog", () => ({
  useMerchantCatalog: () => ({
    products: mockProducts(),
    loading: false,
    error: null,
  }),
}));

vi.mock("../../hooks/useMerchantEscrowOrders", () => ({
  useMerchantEscrowOrders: () => ({
    orders: [
      { orderId: "ord-1", status: "funded" },
      { orderId: "ord-2", status: "shipped" },
    ],
    loading: false,
  }),
}));

vi.mock("../../hooks/useMerchantPayouts", () => ({
  useMerchantPayouts: () => ({
    payouts: [
      { id: "pay-1", amountStroops: "10000000", feeStroops: "100000" },
    ],
    loading: false,
  }),
}));

vi.mock("@delegolabs/ui", () => ({
  Card: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <section aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  ),
}));

describe("MerchantDashboardRootPage (/merchant)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dashboard root and overview cards", () => {
    mockProducts.mockReturnValue([
      { id: "1", title: "Product 1", stockQuantity: 20, isListed: true },
    ]);

    render(<MerchantDashboardRootPage />);

    expect(screen.getByRole("heading", { name: "Merchant Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Manage Catalog")).toBeInTheDocument();
    expect(screen.getByText("View Orders")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders red warning banner when catalog products have 0 items remaining", () => {
    mockProducts.mockReturnValue([
      { id: "1", title: "Wireless Charger", stockQuantity: 0, isListed: true },
      { id: "2", title: "USB Cable", stockQuantity: 15, isListed: true },
    ]);

    render(<MerchantDashboardRootPage />);

    const alertBanner = screen.getByRole("alert");
    expect(alertBanner).toBeInTheDocument();
    expect(alertBanner).toHaveAttribute("data-severity", "red");
    expect(screen.getByText(/Wireless Charger/i)).toBeInTheDocument();
    expect(screen.getByText(/1 catalog item out of stock/i)).toBeInTheDocument();
  });

  it("renders amber warning banner when items are low in stock (< 5) but not 0", () => {
    mockProducts.mockReturnValue([
      { id: "1", title: "Keyboard Wrist Rest", stockQuantity: 3, isListed: true },
      { id: "2", title: "Mouse Pad", stockQuantity: 4, isListed: true },
    ]);

    render(<MerchantDashboardRootPage />);

    const alertBanner = screen.getByRole("alert");
    expect(alertBanner).toBeInTheDocument();
    expect(alertBanner).toHaveAttribute("data-severity", "amber");
    expect(screen.getByText(/2 catalog items/i)).toBeInTheDocument();
    expect(screen.getByText(/Keyboard Wrist Rest, Mouse Pad/i)).toBeInTheDocument();
  });

  it("navigates to filtered low-stock catalog when clicking Restock CTA", () => {
    mockProducts.mockReturnValue([
      { id: "1", title: "Empty Product", stockQuantity: 0, isListed: true },
    ]);

    render(<MerchantDashboardRootPage />);

    const restockBtn = screen.getByTestId("low-stock-restock-cta");
    fireEvent.click(restockBtn);

    expect(mockPush).toHaveBeenCalledWith("/merchant/catalog?lowStock=1");
  });

  it("allows merchants to dismiss the banner", () => {
    mockProducts.mockReturnValue([
      { id: "1", title: "Depleted Product", stockQuantity: 0, isListed: true },
    ]);

    render(<MerchantDashboardRootPage />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    const dismissBtn = screen.getByTestId("low-stock-dismiss-button");
    fireEvent.click(dismissBtn);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not count inactive/unlisted products as depleted", () => {
    mockProducts.mockReturnValue([
      { id: "1", title: "Unlisted Old Item", stockQuantity: 0, isListed: false },
      { id: "2", title: "Active Healthy Item", stockQuantity: 10, isListed: true },
    ]);

    render(<MerchantDashboardRootPage />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
