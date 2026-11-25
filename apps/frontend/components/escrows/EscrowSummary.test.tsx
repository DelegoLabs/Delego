import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Escrow } from "@delegolabs/types";
import { CurrencyProvider } from "../../hooks/useCurrency";
import { EscrowSummary } from "./EscrowSummary";

const baseEscrow: Escrow = {
  escrowId: "1",
  buyer: "GBUYER",
  seller: "GSELLER",
  amount: "1000000000",
  status: "Funded",
  orderId: "order-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function renderSummary(escrows: Escrow[]) {
  return render(
    <CurrencyProvider>
      <EscrowSummary escrows={escrows} />
    </CurrencyProvider>
  );
}

describe("EscrowSummary", () => {
  it("shows counts for funded, disputed, and released escrows", () => {
    renderSummary([
      baseEscrow,
      {
        ...baseEscrow,
        escrowId: "2",
        status: "disputed",
        amount: "2000000000",
      },
      { ...baseEscrow, escrowId: "3", status: "Released" },
      { ...baseEscrow, escrowId: "4", status: "refunded" },
    ]);

    expect(screen.getByTestId("escrow-summary-funded")).toHaveTextContent("1");
    expect(screen.getByTestId("escrow-summary-disputed")).toHaveTextContent(
      "1"
    );
    expect(screen.getByTestId("escrow-summary-released")).toHaveTextContent(
      "1"
    );
  });

  it("shows the total amount still locked in funded and disputed escrows", () => {
    renderSummary([
      baseEscrow,
      {
        ...baseEscrow,
        escrowId: "2",
        status: "Disputed",
        amount: "2500000000",
      },
      {
        ...baseEscrow,
        escrowId: "3",
        status: "Released",
        amount: "9000000000",
      },
    ]);

    expect(screen.getByTestId("escrow-summary-locked")).toHaveTextContent(
      "350.00 XLM"
    );
  });
});
