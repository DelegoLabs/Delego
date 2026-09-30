import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  PathPaymentSlippageSlider,
  calculateMinimumReceivedAmount,
  calculateMaxSourceAmount,
  calculatePriceImpactFromReserves,
} from "./PathPaymentSlippageSlider.js";

describe("PathPaymentSlippageSlider utilities", () => {
  it("calculates minimum received amount accurately", () => {
    // 100 USDC with 0.5% slippage => 100 * (1 - 0.005) = 99.5
    expect(calculateMinimumReceivedAmount("100", 0.5)).toBe("99.5");
    // 100 USDC with 1.0% slippage => 99
    expect(calculateMinimumReceivedAmount("100", 1.0)).toBe("99");
    // 100 USDC with 0.1% slippage => 99.9
    expect(calculateMinimumReceivedAmount("100", 0.1)).toBe("99.9");
    // 0 or invalid amount returns "0"
    expect(calculateMinimumReceivedAmount("0", 0.5)).toBe("0");
    expect(calculateMinimumReceivedAmount("abc", 0.5)).toBe("0");
  });

  it("calculates maximum source amount accurately", () => {
    // 50 XLM with 0.5% slippage => 50 * 1.005 = 50.25
    expect(calculateMaxSourceAmount("50", 0.5)).toBe("50.25");
    // 50 XLM with 1.0% slippage => 50.5
    expect(calculateMaxSourceAmount("50", 1.0)).toBe("50.5");
    expect(calculateMaxSourceAmount("0", 0.5)).toBe("0");
  });

  it("calculates price impact from liquidity pool reserves", () => {
    // 10 source tokens traded against pool reserve of 1000 => 10 / (1000 + 10) * 100 ~= 0.99%
    expect(calculatePriceImpactFromReserves("10", "1000")).toBe(0.99);
    // 50 source tokens traded against reserve of 1000 => 50 / 1050 * 100 ~= 4.76%
    expect(calculatePriceImpactFromReserves("50", "1000")).toBe(4.76);
    // Zero or invalid reserves
    expect(calculatePriceImpactFromReserves("10", "0")).toBe(0);
  });
});

describe("PathPaymentSlippageSlider component", () => {
  it("renders with default presets (0.1%, 0.5%, 1.0%) and default 0.5% selected", () => {
    render(<PathPaymentSlippageSlider />);

    expect(screen.getByText("Slippage Tolerance")).toBeInTheDocument();
    expect(screen.getByTestId("current-slippage-badge")).toHaveTextContent("0.5%");
    expect(screen.getByTestId("preset-0.1")).toHaveTextContent("0.1%");
    expect(screen.getByTestId("preset-0.5")).toHaveTextContent("0.5%");
    expect(screen.getByTestId("preset-1")).toHaveTextContent("1%");
    expect(screen.getByTestId("preset-custom")).toHaveTextContent("Custom");

    // 0.5% preset should be active by default
    expect(screen.getByTestId("preset-0.5")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("preset-0.1")).toHaveAttribute("aria-pressed", "false");
  });

  it("switches preset when clicked and triggers onChange", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<PathPaymentSlippageSlider onChange={handleChange} />);

    // Click 1.0% preset
    await user.click(screen.getByTestId("preset-1"));

    expect(handleChange).toHaveBeenCalledWith(1);
    expect(screen.getByTestId("current-slippage-badge")).toHaveTextContent("1%");
    expect(screen.getByTestId("preset-1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("preset-0.5")).toHaveAttribute("aria-pressed", "false");

    // Click 0.1% preset
    await user.click(screen.getByTestId("preset-0.1"));
    expect(handleChange).toHaveBeenCalledWith(0.1);
    expect(screen.getByTestId("current-slippage-badge")).toHaveTextContent("0.1%");
  });

  it("updates value when the range slider is moved", () => {
    const handleChange = vi.fn();
    render(<PathPaymentSlippageSlider onChange={handleChange} />);

    const slider = screen.getByRole("slider", { name: /slippage tolerance slider/i });
    expect(slider).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "0.8" } });

    expect(handleChange).toHaveBeenCalledWith(0.8);
    expect(screen.getByTestId("current-slippage-badge")).toHaveTextContent("0.8%");
  });

  it("allows custom slippage input when Custom preset is selected", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<PathPaymentSlippageSlider onChange={handleChange} />);

    await user.click(screen.getByTestId("preset-custom"));

    const customInput = screen.getByLabelText(/custom slippage tolerance percent/i);
    expect(customInput).toBeInTheDocument();

    fireEvent.change(customInput, { target: { value: "1.75" } });

    expect(handleChange).toHaveBeenCalledWith(1.75);
    expect(screen.getByTestId("current-slippage-badge")).toHaveTextContent("1.75%");
  });

  it("dynamically calculates and updates minimum received amount", async () => {
    const user = userEvent.setup();

    render(
      <PathPaymentSlippageSlider
        destinationAmount="200"
        destinationToken="USDC"
        sourceAmount="1000"
        sourceToken="XLM"
      />
    );

    // Initial 0.5% of 200 USDC => 200 * 0.995 = 199 USDC
    expect(screen.getByTestId("minimum-received-amount")).toHaveTextContent("199 USDC");
    // Maximum to pay 1000 * 1.005 = 1005 XLM
    expect(screen.getByTestId("maximum-source-amount")).toHaveTextContent("1005 XLM");

    // Change to 1.0% preset => 200 * 0.99 = 198 USDC
    await user.click(screen.getByTestId("preset-1"));
    expect(screen.getByTestId("minimum-received-amount")).toHaveTextContent("198 USDC");
    expect(screen.getByTestId("maximum-source-amount")).toHaveTextContent("1010 XLM");
  });

  it("displays normal styling when price impact is under 2%", () => {
    render(<PathPaymentSlippageSlider estimatedPriceImpactPercent={0.45} />);

    const badge = screen.getByTestId("price-impact-value");
    expect(badge).toHaveTextContent("0.45%");
    // No warning banner
    expect(screen.queryByTestId("price-impact-warning")).not.toBeInTheDocument();
  });

  it("shows prominent amber warning color when price impact exceeds 2%", () => {
    render(<PathPaymentSlippageSlider estimatedPriceImpactPercent={2.85} />);

    const badge = screen.getByTestId("price-impact-value");
    expect(badge).toHaveTextContent("2.85%");

    const warning = screen.getByTestId("price-impact-warning");
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent(/High Price Impact Warning/i);
    expect(warning).toHaveTextContent(/2.85%/);
  });

  it("shows severe red alert when price impact exceeds 5%", () => {
    render(<PathPaymentSlippageSlider estimatedPriceImpactPercent={6.2} />);

    const badge = screen.getByTestId("price-impact-value");
    expect(badge).toHaveTextContent("6.20%");

    const alert = screen.getByTestId("price-impact-warning");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Excessive Price Impact Alert/i);
    expect(alert).toHaveTextContent(/6.20%/);
  });

  it("displays pool reserves and calculates price impact dynamically when reserves are passed", () => {
    render(
      <PathPaymentSlippageSlider
        sourceAmount="50"
        sourceToken="XLM"
        destinationAmount="10"
        destinationToken="USDC"
        reserves={{
          sourceReserve: "1000",
          destinationReserve: "200",
        }}
      />
    );

    expect(screen.getByTestId("pool-reserves-info")).toHaveTextContent(
      "1000 XLM / 200 USDC"
    );

    // 50 / 1050 * 100 = 4.76% (which exceeds 2% threshold)
    const badge = screen.getByTestId("price-impact-value");
    expect(badge).toHaveTextContent("4.76%");
    expect(screen.getByTestId("price-impact-warning")).toBeInTheDocument();
  });
});
