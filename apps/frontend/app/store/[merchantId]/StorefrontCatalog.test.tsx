import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { StorefrontCatalog } from "./StorefrontCatalog";
import type { MerchantProduct } from "../../../lib/storefront";

vi.mock("../../../hooks/useCart", () => ({
  useCart: () => ({
    addItem: vi.fn(),
    openDrawer: vi.fn(),
    summary: { totalQuantity: 0 },
  }),
}));

vi.mock("../../../lib/stockDepletion", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    fetchStockDepletion: vi.fn().mockResolvedValue(null),
    canAddToCart: vi.fn().mockReturnValue(true),
    availableToSell: vi.fn().mockReturnValue(10),
  };
});

const sampleProducts: MerchantProduct[] = [
  {
    id: "prod-1",
    name: "Stellar Hardware Wallet",
    description: "Cold storage security for Soroban assets.",
    priceStroops: "100000000",
    active: true,
    policy: {
      returnWindowDays: 14,
      restockingFeePercent: 5,
      freeShippingThresholdStroops: "250000000",
      escrowProtectionNotice: "Full escrow guarantee on hardware authentications.",
    },
  },
];

describe("StorefrontCatalog with PolicyAccordion", () => {
  it("renders product and toggles PolicyAccordion when viewing details", () => {
    render(
      <StorefrontCatalog
        products={sampleProducts}
        merchantId="merchant-stellar"
        merchantName="Stellar Vaults"
        payoutAddress="GABC123"
      />
    );

    expect(screen.getByText("Stellar Hardware Wallet")).toBeInTheDocument();

    // Details are initially collapsed
    expect(screen.queryByTestId("policy-accordion")).not.toBeInTheDocument();

    // Click "View details"
    const viewDetailsBtn = screen.getByRole("button", { name: "View details" });
    act(() => {
      fireEvent.click(viewDetailsBtn);
    });

    // PolicyAccordion is now visible
    expect(screen.getByTestId("policy-accordion")).toBeInTheDocument();
    expect(screen.getByText("Delego Escrow Buyer Protection")).toBeInTheDocument();
    expect(screen.getByText("Full escrow guarantee on hardware authentications.")).toBeInTheDocument();
    expect(screen.getByText(/14-day window/i)).toBeInTheDocument();

    // Click "Hide details"
    const hideDetailsBtn = screen.getByRole("button", { name: "Hide details" });
    act(() => {
      fireEvent.click(hideDetailsBtn);
    });
    expect(screen.queryByTestId("policy-accordion")).not.toBeInTheDocument();
  });
});
