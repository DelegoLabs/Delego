import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EscrowFeeBreakdown } from "@delego/types";
import { FeeBreakdown } from "./FeeBreakdown";

function makeFees(overrides: Partial<EscrowFeeBreakdown> = {}): EscrowFeeBreakdown {
  return {
    grossStroops: 10_000_000n,
    feeStroops: 250_000n,
    feeBasisPoints: 250,
    isEstimated: false,
    netStroops: 9_750_000n,
    treasuries: [],
    ...overrides,
  };
}

describe("FeeBreakdown", () => {
  it("renders gross, fee, and net using the shared stroopsToDisplay formatter", () => {
    render(<FeeBreakdown fees={makeFees()} />);
    expect(screen.getByText("1.0000000 XLM")).toBeInTheDocument(); // gross
    expect(screen.getByText("0.0250000 XLM")).toBeInTheDocument(); // fee
    expect(screen.getByText("0.9750000 XLM")).toBeInTheDocument(); // net
  });

  it("renders '—' rather than '0'/'0.00' when fee config is missing", () => {
    render(<FeeBreakdown fees={makeFees({ feeStroops: null, feeBasisPoints: null, netStroops: null })} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(2); // fee row + net row
    expect(screen.queryByText("0.0000000 XLM")).not.toBeInTheDocument();
  });

  it("shows an 'Estimated' badge for a dynamic fee, without fabricating a fee amount", () => {
    render(
      <FeeBreakdown
        fees={makeFees({ isEstimated: true, feeStroops: null, feeBasisPoints: null, netStroops: null })}
      />
    );
    expect(screen.getByText("Estimated")).toBeInTheDocument();
  });

  it("renders an expandable treasury breakdown when multiple treasuries apply", () => {
    render(
      <FeeBreakdown
        fees={makeFees({
          treasuries: [
            { name: "Platform", address: "GPLATFORM", splitBasisPoints: 8000, amountStroops: 200_000n },
            { name: "Referral pool", address: "GREFERRAL", splitBasisPoints: 2000, amountStroops: 50_000n },
          ],
        })}
      />
    );
    expect(screen.getByText("Treasury breakdown (2)")).toBeInTheDocument();
  });
});
