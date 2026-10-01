import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { YieldProjectionCalculator } from "./YieldProjectionCalculator";

describe("YieldProjectionCalculator", () => {
  it("renders the calculator with principal and default APY", () => {
    render(<YieldProjectionCalculator principalAmount={10_000} />);
    expect(
      screen.getByTestId("yield-projection-calculator"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("yield-projection-principal")).toHaveTextContent(
      /\$10,000\.00/,
    );
    expect(screen.getByTestId("yield-projection-apy")).toHaveTextContent("4.50%");
  });

  it("shows projected earnings for the default 30-day window", () => {
    render(<YieldProjectionCalculator principalAmount={10_000} />);
    const earnings = screen.getByTestId("yield-projection-earnings");
    // 30 days at 4.5% APY on 10k ≈ $37.05 compound
    expect(earnings.textContent).toMatch(/\$3[0-9]\.\d{2}/);
  });

  it("updates projected earnings when the slider moves", () => {
    render(<YieldProjectionCalculator principalAmount={10_000} />);
    const slider = screen.getByTestId("yield-projection-slider");
    fireEvent.change(slider, { target: { value: "365" } });
    expect(screen.getByTestId("yield-projection-days")).toHaveTextContent("365");
    // One year at 4.5% on 10k ≈ $460
    expect(screen.getByTestId("yield-projection-earnings")).toHaveTextContent(
      /\$4[0-9][0-9]\.\d{2}/,
    );
  });

  it("supports controlled holdingDays", () => {
    render(
      <YieldProjectionCalculator principalAmount={5_000} holdingDays={90} />,
    );
    expect(screen.getByTestId("yield-projection-days")).toHaveTextContent("90");
  });

  it("calls onHoldingDaysChange when the slider moves", () => {
    const onChange = vi.fn();
    render(
      <YieldProjectionCalculator
        principalAmount={1000}
        onHoldingDaysChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("yield-projection-slider"), {
      target: { value: "60" },
    });
    expect(onChange).toHaveBeenCalledWith(60);
  });

  it("shows the disclaimer tooltip on focus", () => {
    render(<YieldProjectionCalculator principalAmount={1000} />);
    const button = screen.getByRole("button", {
      name: "Yield projection disclaimer",
    });
    fireEvent.focus(button);
    // Tooltip text is present in the DOM (visibility toggled via style)
    expect(
      screen.getByRole("tooltip"),
    ).toHaveTextContent(/not guaranteed/i);
  });

  it("renders zero earnings for zero principal", () => {
    render(<YieldProjectionCalculator principalAmount={0} />);
    expect(screen.getByTestId("yield-projection-earnings")).toHaveTextContent(
      /\$0\.00/,
    );
  });
});
