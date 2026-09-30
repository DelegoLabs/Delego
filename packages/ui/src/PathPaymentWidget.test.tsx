import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PathPaymentWidget, type PathPaymentQuote, type PathPaymentEstimate } from "./PathPaymentWidget.js";

const mockQuote: PathPaymentQuote = {
  sourceToken: "XLM",
  sourceAmount: "50.2500000",
  destinationToken: "USDC",
  destinationAmount: "10.0000000",
  estimatedPriceImpactPercent: 2.5,
  slippageTolerancePercent: 0.5,
};

const mockEstimate: PathPaymentEstimate = {
  sourceAsset: "XLM",
  destinationAsset: "USDC",
  sourceAmountMax: "50.2500000",
  destinationAmount: "10.0000000",
  estimatedRate: "0.2000000",
  slippageTolerancePercent: 0.5,
  path: ["AQUA"],
};

describe("PathPaymentWidget", () => {
  it("renders source asset selector and required escrow amount", () => {
    render(
      <PathPaymentWidget
        sourceAssetOptions={["XLM", "EURC", "USDC"]}
        destinationAsset="USDC"
        destinationAmount="10.0000000"
        sourceAsset="XLM"
        onSourceAssetChange={vi.fn()}
        quote={mockQuote}
      />
    );

    expect(screen.getByLabelText(/pay with/i)).toBeInTheDocument();
    expect(screen.getByText("Escrow requires")).toBeInTheDocument();
    expect(screen.getByText("10.0000000 USDC")).toBeInTheDocument();
  });

  it("renders interactive slippage slider, presets, and price impact warning for PathPaymentQuote", () => {
    render(
      <PathPaymentWidget
        sourceAssetOptions={["XLM", "USDC"]}
        destinationAsset="USDC"
        destinationAmount="10.0000000"
        sourceAsset="XLM"
        onSourceAssetChange={vi.fn()}
        quote={mockQuote}
      />
    );

    // Slippage slider and presets
    expect(screen.getByText("Slippage Tolerance")).toBeInTheDocument();
    expect(screen.getByTestId("preset-0.1")).toBeInTheDocument();
    expect(screen.getByTestId("preset-0.5")).toBeInTheDocument();
    expect(screen.getByTestId("preset-1")).toBeInTheDocument();

    // Prominent price impact warning since estimatedPriceImpactPercent is 2.5% (> 2.0%)
    expect(screen.getByTestId("price-impact-warning")).toBeInTheDocument();
    expect(screen.getByText(/High Price Impact Warning/i)).toBeInTheDocument();
  });

  it("updates slippage dynamically and triggers callback", async () => {
    const user = userEvent.setup();
    const handleSlippageChange = vi.fn();

    render(
      <PathPaymentWidget
        sourceAssetOptions={["XLM", "USDC"]}
        destinationAsset="USDC"
        destinationAmount="10.0000000"
        sourceAsset="XLM"
        onSourceAssetChange={vi.fn()}
        quote={mockQuote}
        onSlippageChange={handleSlippageChange}
      />
    );

    // Click 1% preset
    await user.click(screen.getByTestId("preset-1"));

    expect(handleSlippageChange).toHaveBeenCalledWith(1);
    expect(screen.getByTestId("current-slippage-badge")).toHaveTextContent("1%");
  });

  it("supports backwards-compatible PathPaymentEstimate with route and rate", () => {
    render(
      <PathPaymentWidget
        sourceAssetOptions={["XLM", "USDC"]}
        destinationAsset="USDC"
        destinationAmount="10.0000000"
        sourceAsset="XLM"
        onSourceAssetChange={vi.fn()}
        estimate={mockEstimate}
      />
    );

    expect(screen.getByText(/1 XLM ≈ 0.2000000 USDC/i)).toBeInTheDocument();
    expect(screen.getByText("XLM → AQUA → USDC")).toBeInTheDocument();
  });

  it("renders loading message when loading is true", () => {
    render(
      <PathPaymentWidget
        sourceAssetOptions={["XLM", "USDC"]}
        destinationAsset="USDC"
        destinationAmount="10.0000000"
        sourceAsset="XLM"
        onSourceAssetChange={vi.fn()}
        loading={true}
      />
    );

    expect(screen.getByText("Fetching live quote…")).toBeInTheDocument();
  });

  it("renders no-route alert when no estimate or quote exists for cross-asset pair", () => {
    render(
      <PathPaymentWidget
        sourceAssetOptions={["XLM", "USDC"]}
        destinationAsset="USDC"
        destinationAmount="10.0000000"
        sourceAsset="XLM"
        onSourceAssetChange={vi.fn()}
        estimate={null}
        quote={null}
      />
    );

    expect(
      screen.getByText("No path payment route available for XLM → USDC.")
    ).toBeInTheDocument();
  });

  it("omits the route row when the quote has no intermediate path", () => {
    render(
      <PathPaymentWidget
        sourceAssetOptions={["XLM", "USDC"]}
        destinationAsset="USDC"
        destinationAmount="10.0000000"
        sourceAsset="XLM"
        onSourceAssetChange={vi.fn()}
        estimate={{ ...mockEstimate, path: [] }}
      />
    );
    expect(screen.queryByText("Route")).toBeNull();
    expect(screen.getByText("50.2500000 XLM")).toBeDefined();
  });

  it("hides the quote and warnings when paying in the destination asset", () => {
    render(
      <PathPaymentWidget
        sourceAssetOptions={["XLM", "USDC"]}
        destinationAsset="USDC"
        destinationAmount="10.0000000"
        sourceAsset="USDC"
        onSourceAssetChange={vi.fn()}
        estimate={mockEstimate}
      />
    );
    expect(screen.queryByText("You pay (max)")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports the chosen source asset and resets a dismissed warning", async () => {
    const user = userEvent.setup();
    const onSourceAssetChange = vi.fn();
    render(
      <PathPaymentWidget
        sourceAssetOptions={["XLM", "USDC"]}
        destinationAsset="USDC"
        destinationAmount="10.0000000"
        sourceAsset="XLM"
        onSourceAssetChange={onSourceAssetChange}
        estimate={{ ...mockEstimate, slippageTolerancePercent: 2.5 }}
      />
    );

    expect(screen.getByRole("alert").textContent).toContain("Market slippage (2.5%)");

    await user.click(screen.getByLabelText("Dismiss slippage warning"));
    expect(screen.queryByRole("alert")).toBeNull();

    // Choosing a new asset clears the dismissal, so the warning returns.
    await user.selectOptions(screen.getByLabelText("Pay with"), "USDC");
    expect(onSourceAssetChange).toHaveBeenCalledWith("USDC");
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("honours a custom slippage warning threshold", () => {
    render(
      <PathPaymentWidget
        sourceAssetOptions={["XLM", "USDC"]}
        destinationAsset="USDC"
        destinationAmount="10.0000000"
        sourceAsset="XLM"
        onSourceAssetChange={vi.fn()}
        estimate={{ ...mockEstimate, slippageTolerancePercent: 1.0 }}
        slippageWarningThresholdPercent={0.5}
      />
    );
    expect(screen.getByRole("alert").textContent).toContain("Market slippage (1%)");
  });
});
