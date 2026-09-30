import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuoteComparisonDrawer } from "./QuoteComparisonDrawer";
import type { MerchantQuote } from "../../lib/merchantQuotes";

const quotes: MerchantQuote[] = [
  {
    merchantId: "fast",
    merchantName: "Fast Co",
    itemPriceStroops: "1200000000",
    shippingPriceStroops: "300000000",
    estimatedDeliveryDays: 1,
    reputationScore: 4,
    contractEscrowSupported: true,
  },
  {
    merchantId: "trusted",
    merchantName: "Trusted Co",
    itemPriceStroops: "950000000",
    shippingPriceStroops: "50000000",
    estimatedDeliveryDays: 3,
    reputationScore: 5,
    contractEscrowSupported: true,
  },
  {
    merchantId: "cheap",
    merchantName: "Cheap Co",
    itemPriceStroops: "800000000",
    shippingPriceStroops: "100000000",
    estimatedDeliveryDays: 7,
    reputationScore: 3,
    contractEscrowSupported: false,
  },
];

function merchantOrder() {
  return screen
    .getAllByRole("rowheader")
    .map((h) => h.textContent?.replace(/Agent's pick.*/, ""));
}

describe("QuoteComparisonDrawer", () => {
  it("renders nothing when closed", () => {
    render(
      <QuoteComparisonDrawer
        quotes={quotes}
        isOpen={false}
        onClose={vi.fn()}
        onSelectQuote={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("highlights the recommended pick and sorts by each key", () => {
    render(
      <QuoteComparisonDrawer
        quotes={quotes}
        isOpen
        onClose={vi.fn()}
        onSelectQuote={vi.fn()}
      />
    );

    const pick = screen.getByText(/Agent's pick/).closest("tr")!;
    expect(pick).toHaveAttribute("data-recommended", "true");
    expect(within(pick).getByRole("rowheader")).toHaveTextContent("Trusted Co");

    expect(merchantOrder()).toEqual(["Cheap Co", "Trusted Co", "Fast Co"]);
    fireEvent.click(screen.getByRole("button", { name: "Speed" }));
    expect(merchantOrder()).toEqual(["Fast Co", "Trusted Co", "Cheap Co"]);
    fireEvent.click(screen.getByRole("button", { name: "Reputation" }));
    expect(merchantOrder()).toEqual(["Trusted Co", "Fast Co", "Cheap Co"]);
    expect(screen.getByRole("button", { name: "Reputation" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("selects a quote and closes on Escape", () => {
    const onSelectQuote = vi.fn();
    const onClose = vi.fn();
    render(
      <QuoteComparisonDrawer
        quotes={quotes}
        isOpen
        onClose={onClose}
        onSelectQuote={onSelectQuote}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Select quote from Cheap Co" })
    );
    expect(onSelectQuote).toHaveBeenCalledWith("cheap");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
