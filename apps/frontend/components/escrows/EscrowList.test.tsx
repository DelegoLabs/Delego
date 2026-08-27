import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Escrow } from "@delegolabs/types";
import { EscrowList } from "./EscrowList";

const mockUseEscrows = vi.fn();
vi.mock("../../hooks/useEscrows", () => ({
  useEscrows: () => mockUseEscrows(),
}));

function makeEscrow(overrides: Partial<Escrow> = {}): Escrow {
  return {
    id: "escrow-1",
    escrowId: "escrow-1",
    orderId: "order-1",
    buyer: "buyer-1",
    seller: "seller-1",
    amount: 100n,
    status: "Funded",
    timeoutLedger: 1000,
    currentLedger: 900,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("EscrowList", () => {
  beforeEach(() => {
    mockUseEscrows.mockReset();
  });

  it("shows the empty state when there are no escrows", () => {
    mockUseEscrows.mockReturnValue({ escrows: [], loading: false, error: null });
    render(<EscrowList />);
    expect(screen.getByText("No escrows yet.")).toBeInTheDocument();
  });

  it("surfaces a load error", () => {
    mockUseEscrows.mockReturnValue({ escrows: [], loading: false, error: "Failed to load escrows" });
    render(<EscrowList />);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load escrows");
  });

  it("does not show the sticky action bar until something is selected", () => {
    mockUseEscrows.mockReturnValue({
      escrows: [makeEscrow({ id: "a" }), makeEscrow({ id: "b" })],
      loading: false,
      error: null,
    });
    render(<EscrowList />);
    expect(screen.queryByTestId("sticky-action-bar")).toBeNull();
  });

  it("selecting a row shows the sticky action bar with the right count", async () => {
    mockUseEscrows.mockReturnValue({
      escrows: [makeEscrow({ id: "a", escrowId: "esc-a" }), makeEscrow({ id: "b", escrowId: "esc-b" })],
      loading: false,
      error: null,
    });
    const user = userEvent.setup();
    render(<EscrowList />);

    await user.click(screen.getByLabelText("Select escrow esc-a"));
    expect(screen.getByTestId("sticky-action-bar")).toHaveTextContent("1 selected");
  });

  it("select all toggles every row, and toggling again clears the selection", async () => {
    mockUseEscrows.mockReturnValue({
      escrows: [makeEscrow({ id: "a", escrowId: "esc-a" }), makeEscrow({ id: "b", escrowId: "esc-b" })],
      loading: false,
      error: null,
    });
    const user = userEvent.setup();
    render(<EscrowList />);

    await user.click(screen.getByLabelText("Select all escrows"));
    expect(screen.getByTestId("sticky-action-bar")).toHaveTextContent("2 selected");

    await user.click(screen.getByLabelText("Select all escrows"));
    expect(screen.queryByTestId("sticky-action-bar")).toBeNull();
  });

  it("clearing the selection from the action bar deselects every row", async () => {
    mockUseEscrows.mockReturnValue({
      escrows: [makeEscrow({ id: "a", escrowId: "esc-a" })],
      loading: false,
      error: null,
    });
    const user = userEvent.setup();
    render(<EscrowList />);

    await user.click(screen.getByLabelText("Select escrow esc-a"));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.queryByTestId("sticky-action-bar")).toBeNull();
    expect(screen.getByLabelText("Select escrow esc-a")).not.toBeChecked();
  });
});
