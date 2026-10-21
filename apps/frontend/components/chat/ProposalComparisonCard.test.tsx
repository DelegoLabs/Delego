import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { ProposalComparisonCard } from "./ProposalComparisonCard";
import type { PurchaseProposal } from "../../types/proposal";

function makeMatrix(): ProposalComparisonMatrix {
  return {
    productTitle: "Wireless Headphones",
    offers: [
      {
        merchantId: "merchant-1",
        merchantName: "Merchant A",
        priceStroops: "500000000",
        shippingStroops: "100000000",
        estimatedDeliveryDays: 3,
        ratingScore: 4.8,
        escrowAddress: "GCSV4EXAMPLE0000000MERCHANT1234567890ABCDEF",
        proposalId: "prop-1",
      },
      {
        merchantId: "merchant-2",
        merchantName: "Merchant B",
        priceStroops: "450000000",
        shippingStroops: "150000000",
        estimatedDeliveryDays: 5,
        ratingScore: 4.2,
        escrowAddress: "GCSV4EXAMPLE0000000MERCHANT1234567890ABCDEF",
        proposalId: "prop-2",
      },
      {
        merchantId: "merchant-3",
        merchantName: "Merchant C",
        priceStroops: "550000000",
        shippingStroops: "50000000",
        estimatedDeliveryDays: 7,
        ratingScore: 4.5,
        escrowAddress: "GCSV4EXAMPLE0000000MERCHANT1234567890ABCDEF",
        proposalId: "prop-3",
      },
    ],
    recommendedIndex: 0,
  };
};

describe("ProposalComparisonCard — display", () => {
  it("renders comparison card with three merchant offers", () => {
    const onAccept = vi.fn();
    render(
      <ProposalComparisonCard matrix={makeMatrix()} onAccept={onAccept} />
    );
    expect(screen.getByTestId("proposal-comparison-card")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("renders merchant names", () => {
    render(
      <ProposalComparisonCard matrix={makeMatrix()} onAccept={() => {}} />
    );
    expect(screen.getByText("Merchant A")).toBeInTheDocument();
    expect(screen.getByText("Merchant B")).toBeInTheDocument();
    expect(screen.getByText("Merchant C")).toBeInTheDocument();
  });

  it("renders prices for each offer", () => {
    const onAccept = vi.fn();
    render(
      <ProposalComparisonCard matrix={makeMatrix()} onAccept={onAccept} />
    );
    // formatStroops outputs "$500.00M" for 500M stroops
    // Verify dollar amounts are present in price cells
    const priceContent = screen.getAllByText(/\$[\d.]+M?/);
    expect(priceContent.length).toBeGreaterThanOrEqual(3);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("renders delivery estimates", () => {
    render(
      <ProposalComparisonCard matrix={makeMatrix()} onAccept={() => {}} />
    );
    expect(screen.getByText("3 days")).toBeInTheDocument();
    expect(screen.getByText("5 days")).toBeInTheDocument();
    expect(screen.getByText("7 days")).toBeInTheDocument();
  });

  it("renders rating badges", () => {
    render(
      <ProposalComparisonCard matrix={makeMatrix()} onAccept={() => {}} />
    );
    expect(screen.getAllByTestId("proposal-rating-badge")).toHaveLength(3);
  });
});

describe("ProposalComparisonCard — accept flow", () => {
  it("calls onAccept when accept button is clicked", async () => {
    const onAccept = vi.fn();
    render(
      <ProposalComparisonCard matrix={makeMatrix()} onAccept={onAccept} />
    );
    const acceptButtons = screen.getAllByRole("button", {
      name: /Accept This Offer|Selected/,
    });
    await userEvent.click(acceptButtons[0]);
    expect(onAccept).toHaveBeenCalledWith("merchant-1", "prop-1");
  });

  it("disables accept button after selection", async () => {
    const onAccept = vi.fn();
    render(
      <ProposalComparisonCard matrix={makeMatrix()} onAccept={onAccept} />
    );
    const acceptButtons = screen.getAllByRole("button", {
      name: /Accept This Offer|Selected/,
    });
    expect(acceptButtons[0].disabled).toBe(false);
    await userEvent.click(acceptButtons[0]);
    expect(acceptButtons[0].disabled).toBe(true);
  });
});