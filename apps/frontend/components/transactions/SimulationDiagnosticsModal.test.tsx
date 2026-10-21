import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SimulationDiagnosticsModal } from "./SimulationDiagnosticsModal";
import type { SorobanSimulationMetrics } from "@delegolabs/types";

describe("SimulationDiagnosticsModal", () => {
  const mockMetrics: SorobanSimulationMetrics = {
    cpuInstructions: 85_000_000,
    memoryBytes: 5_000_000,
    minResourceFeeStroops: "10000",
    readBytes: 20_000,
    writeBytes: 10_000,
    isSimulatedSuccessfully: true,
  };

  const defaultProps = {
    isOpen: true,
    metrics: mockMetrics,
    warnings: ["CPU instruction usage is high"],
    onClose: vi.fn(),
    onConfirmSign: vi.fn(),
  };

  it("renders metrics, CPU warnings, and proceed button when simulation succeeds", () => {
    render(<SimulationDiagnosticsModal {...defaultProps} />);

    expect(screen.getByText("Soroban Simulation Diagnostics")).toBeInTheDocument();
    expect(screen.getByText("CPU instruction usage is high")).toBeInTheDocument();
    expect(screen.getByText("10000 Stroops")).toBeInTheDocument();

    const proceedBtn = screen.getByRole("button", { name: /Proceed to Sign/i });
    expect(proceedBtn).toBeInTheDocument();

    fireEvent.click(proceedBtn);
    expect(defaultProps.onConfirmSign).toHaveBeenCalled();
  });

  it("displays error message and disables proceed button when simulation fails", () => {
    render(
      <SimulationDiagnosticsModal
        {...defaultProps}
        metrics={{ ...mockMetrics, isSimulatedSuccessfully: false }}
        error="Simulation error: invalid contract call"
      />
    );

    expect(screen.getByText("Simulation Failed")).toBeInTheDocument();
    expect(screen.getByText("Simulation error: invalid contract call")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Proceed to Sign/i })).not.toBeInTheDocument();
  });
});
