import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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
    // `shouldAdvanceTime` keeps the fake clock moving with real time. Without
    // it, Testing Library's `waitFor` polling never advances and every
    // assertion that awaits a promise times out.
    vi.useFakeTimers({ shouldAdvanceTime: true });
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

  it("auto-hides the warning toast after 5 seconds", async () => {
    mockRequestCancellation.mockResolvedValue({
      data: null,
      error: { code: "chain_error", message: "Transaction reverted" },
    });

    render(<CancelEscrowButton escrow={makeEscrow()} />);

    fireEvent.click(screen.getByRole("button", { name: /cancel escrow/i }));

    await waitFor(() =>
      expect(screen.getByText(/Cancellation failed/i)).toBeInTheDocument()
    );

    // The component clears the warning from a 5s setTimeout, so the fake clock
    // has to be driven past it rather than waited out. The inline error stays
    // on screen afterwards — only the toast auto-hides.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.queryByText(/Cancellation failed/i)).toBeNull();
    expect(screen.getByText(/Transaction reverted/i)).toBeInTheDocument();
  }, 10000);
});
