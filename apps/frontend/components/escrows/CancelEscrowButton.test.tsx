import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Escrow } from "@delegolabs/types";
import { CancelEscrowButton } from "./CancelEscrowButton";

const mockRequestCancellation = vi.fn();

vi.mock("../../services/payments", () => ({
  requestCancellation: (...args: unknown[]) => mockRequestCancellation(...args),
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
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("CancelEscrowButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockRequestCancellation.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the cancel button", () => {
    render(<CancelEscrowButton escrow={makeEscrow()} />);
    expect(screen.getByRole("button", { name: /cancel escrow/i })).toBeInTheDocument();
  });

  it("disables the button when escrow is already released", () => {
    render(<CancelEscrowButton escrow={makeEscrow({ status: "Released" })} />);
    expect(screen.getByRole("button", { name: /cancel escrow/i })).toBeDisabled();
  });

  it("shows loading state while cancelling", async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    mockRequestCancellation.mockReturnValue(
      new Promise((resolve) => (resolveRequest = resolve))
    );

    render(<CancelEscrowButton escrow={makeEscrow()} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel escrow/i }));

    expect(screen.getByRole("button", { name: /cancelling/i })).toBeInTheDocument();

    resolveRequest({
      data: {
        escrow: makeEscrow(),
        cancellation: {
          requestedAt: "2026-01-01T00:00:00.000Z",
          gracePeriodSeconds: 30,
          graceExpiresAt: "2026-01-01T00:00:30.000Z",
          serverTimestamp: "2026-01-01T00:00:00.000Z",
        },
      },
      error: null,
    });
  });

  it("calls onCancelled when cancellation succeeds", async () => {
    mockRequestCancellation.mockResolvedValue({
      data: {
        escrow: makeEscrow(),
        cancellation: {
          requestedAt: "2026-01-01T00:00:00.000Z",
          gracePeriodSeconds: 30,
          graceExpiresAt: "2026-01-01T00:00:30.000Z",
          serverTimestamp: "2026-01-01T00:00:00.000Z",
        },
      },
      error: null,
    });

    const onCancelled = vi.fn();
    render(<CancelEscrowButton escrow={makeEscrow()} onCancelled={onCancelled} />);

    fireEvent.click(screen.getByRole("button", { name: /cancel escrow/i }));

    await waitFor(() => expect(onCancelled).toHaveBeenCalledWith("escrow-1"));
  });

  it("shows warning and calls onCancelFailed when transaction reverts", async () => {
    mockRequestCancellation.mockResolvedValue({
      data: null,
      error: { code: "chain_error", message: "Transaction reverted" },
    });

    const onCancelFailed = vi.fn();
    const onRefetch = vi.fn();

    render(
      <CancelEscrowButton
        escrow={makeEscrow()}
        onCancelFailed={onCancelFailed}
        onRefetch={onRefetch}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel escrow/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toContain("Cancellation failed");
    expect(screen.getByRole("alert").textContent).toContain("Transaction reverted");

    expect(onCancelFailed).toHaveBeenCalledWith("escrow-1", "Transaction reverted");
    expect(onRefetch).toHaveBeenCalled();
  });

  it("refetches fresh state after failure", async () => {
    mockRequestCancellation.mockResolvedValue({
      data: null,
      error: { code: "chain_error", message: "Transaction reverted" },
    });

    const onRefetch = vi.fn().mockResolvedValue(undefined);
    render(<CancelEscrowButton escrow={makeEscrow()} onRefetch={onRefetch} />);

    fireEvent.click(screen.getByRole("button", { name: /cancel escrow/i }));

    await waitFor(() => expect(onRefetch).toHaveBeenCalled());
  });

  it("auto-hides warning after 5 seconds", async () => {
    mockRequestCancellation.mockResolvedValue({
      data: null,
      error: { code: "chain_error", message: "Transaction reverted" },
    });

    render(<CancelEscrowButton escrow={makeEscrow()} />);

    fireEvent.click(screen.getByRole("button", { name: /cancel escrow/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    await waitFor(
      () => expect(screen.queryByRole("alert")).toBeNull(),
      { timeout: 6000 }
    );
  });
});
