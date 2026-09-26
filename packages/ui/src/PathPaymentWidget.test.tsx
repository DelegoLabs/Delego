import type { ComponentProps } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PathPaymentWidget, type PathPaymentEstimate } from "./PathPaymentWidget.js";

const estimate: PathPaymentEstimate = {
  sourceAsset: "XLM",
  destinationAsset: "USDC",
  sourceAmountMax: "105.5",
  destinationAmount: "100",
  estimatedRate: "0.948",
  slippageTolerancePercent: 0.4,
  path: ["USD"],
};

function renderWidget(overrides: Partial<ComponentProps<typeof PathPaymentWidget>> = {}) {
  return render(
    <PathPaymentWidget
      sourceAssetOptions={["XLM", "USDC"]}
      destinationAsset="USDC"
      destinationAmount="100"
      sourceAsset="XLM"
      onSourceAssetChange={() => {}}
      estimate={estimate}
      {...overrides}
    />
  );
}

describe("PathPaymentWidget", () => {
  it("renders the source-asset picker and the escrow requirement", () => {
    renderWidget();
    expect(screen.getByLabelText("Pay with")).toBeDefined();
    expect(screen.getByRole("option", { name: "XLM" })).toBeDefined();
    expect(screen.getByRole("option", { name: "USDC" })).toBeDefined();
    expect(screen.getByText("100 USDC")).toBeDefined();
  });

  it("shows a loading message instead of a quote while fetching", () => {
    renderWidget({ loading: true });
    expect(screen.getByText("Fetching live quote…")).toBeDefined();
    expect(screen.queryByText("You pay (max)")).toBeNull();
  });

  it("renders the live quote with amount, rate and route", () => {
    renderWidget();
    expect(screen.getByText("105.5 XLM")).toBeDefined();
    expect(screen.getByText(/1 XLM ≈ 0.948 USDC/)).toBeDefined();
    expect(screen.getByText("XLM → USD → USDC")).toBeDefined();
  });

  it("omits the route row when the quote has no intermediate path", () => {
    renderWidget({ estimate: { ...estimate, path: [] } });
    expect(screen.queryByText("Route")).toBeNull();
    expect(screen.getByText("105.5 XLM")).toBeDefined();
  });

  it("warns when no path payment route is available", () => {
    renderWidget({ estimate: null });
    expect(screen.getByRole("alert").textContent).toContain(
      "No path payment route available for XLM → USDC."
    );
  });

  it("hides the quote and warnings when paying in the destination asset", () => {
    renderWidget({ sourceAsset: "USDC" });
    expect(screen.queryByText("You pay (max)")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports the chosen source asset and resets a dismissed warning", async () => {
    const user = userEvent.setup();
    const onSourceAssetChange = vi.fn();
    renderWidget({
      onSourceAssetChange,
      estimate: { ...estimate, slippageTolerancePercent: 2.5 },
    });

    expect(screen.getByRole("alert").textContent).toContain("Market slippage (2.5%)");

    await user.click(screen.getByLabelText("Dismiss slippage warning"));
    expect(screen.queryByRole("alert")).toBeNull();

    // Choosing a new asset clears the dismissal, so the warning returns.
    await user.selectOptions(screen.getByLabelText("Pay with"), "USDC");
    expect(onSourceAssetChange).toHaveBeenCalledWith("USDC");
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("honours a custom slippage warning threshold", () => {
    renderWidget({
      estimate: { ...estimate, slippageTolerancePercent: 1.0 },
      slippageWarningThresholdPercent: 0.5,
    });
    expect(screen.getByRole("alert").textContent).toContain("Market slippage (1%)");
  });
});
