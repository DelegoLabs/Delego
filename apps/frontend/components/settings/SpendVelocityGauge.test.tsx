import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpendVelocityGauge } from "./SpendVelocityGauge";

describe("SpendVelocityGauge", () => {
  it("calculates percentage and thresholds correctly", () => {
    render(
      <SpendVelocityGauge
        currentSpendStroops="50000000" // 5 XLM
        limitStroops="100000000" // 10 XLM
        windowHours={24}
        remainingSeconds={7200}
      />
    );

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByTestId("current-spend")).toHaveTextContent("5");
    expect(screen.getByTestId("spending-limit")).toHaveTextContent("10");
  });

  it("handles zero limits safely", () => {
    render(
      <SpendVelocityGauge
        currentSpendStroops="0"
        limitStroops="0"
        windowHours={24}
        remainingSeconds={0}
      />
    );

    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});
