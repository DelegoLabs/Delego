import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { Order } from "@delego/types";
import { RefundRequestPanel } from "./RefundRequestPanel";

const mockGetRefundEligibility = vi.fn();
const mockSubmitRefundRequest = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    getRefundEligibility: (...args: unknown[]) => mockGetRefundEligibility(...args),
    submitRefundRequest: (...args: unknown[]) => mockSubmitRefundRequest(...args),
  },
}));

vi.mock("../../hooks/useWallet", () => ({
  useWallet: () => ({ address: "GBUYERADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" }),
}));

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId: "user-1",
    delegationId: "del-1",
    merchantId: "merchant-1",
    status: "escrowed",
    lineItems: [],
    totalStroops: 300_000_000n,
    escrowContractId: "CABC123",
    escrowId: "42",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("RefundRequestPanel", () => {
  beforeEach(() => {
    mockGetRefundEligibility.mockReset();
    mockSubmitRefundRequest.mockReset();
  });

  it("renders nothing when the order has no escrowId", () => {
    mockGetRefundEligibility.mockResolvedValue({ data: null, error: null });
    const { container } = render(<RefundRequestPanel order={makeOrder({ escrowId: null })} />);
    expect(container.firstChild).toBeNull();
  });

  it("disables the CTA with a tooltip when not yet eligible", async () => {
    mockGetRefundEligibility.mockResolvedValue({
      data: { escrowId: "42", eligible: false, reason: "timeout" },
      error: null,
    });

    render(<RefundRequestPanel order={makeOrder()} />);

    const button = await screen.findByRole("button", { name: "Request refund" });
    expect(button).toBeDisabled();

    fireEvent.mouseEnter(button.closest("span")!);
    expect(screen.getByRole("tooltip").textContent).toMatch(/timeout period/);
  });

  it("enables the CTA and submits successfully when eligible", async () => {
    mockGetRefundEligibility.mockResolvedValue({
      data: { escrowId: "42", eligible: true, reason: "ok" },
      error: null,
    });
    mockSubmitRefundRequest.mockResolvedValue({
      data: { txHash: "abc123", ledger: 100, success: true, refundReasonCode: "buyer_cancelled" },
      error: null,
    });

    render(<RefundRequestPanel order={makeOrder()} />);

    const button = await screen.findByRole("button", { name: "Request refund" });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText("Refund settled")).toBeDefined());
    expect(mockSubmitRefundRequest).toHaveBeenCalledTimes(1);
    expect(mockSubmitRefundRequest).toHaveBeenCalledWith("42", {
      sourceAddress: "GBUYERADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      refundReasonCode: "buyer_cancelled",
    });

    // Terminal after success: the form is hidden, so the CTA can't be clicked again.
    expect(screen.queryByRole("button", { name: /Request refund|Requesting/ })).toBeNull();
  });

  it("guards against double submission from rapid clicks", async () => {
    mockGetRefundEligibility.mockResolvedValue({
      data: { escrowId: "42", eligible: true, reason: "ok" },
      error: null,
    });
    let resolveSubmit: (value: unknown) => void = () => {};
    mockSubmitRefundRequest.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      })
    );

    render(<RefundRequestPanel order={makeOrder()} />);

    const button = await screen.findByRole("button", { name: "Request refund" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mockSubmitRefundRequest).toHaveBeenCalledTimes(1);

    resolveSubmit({
      data: { txHash: "abc", ledger: 1, success: true, refundReasonCode: "buyer_cancelled" },
      error: null,
    });
    await waitFor(() => expect(screen.getByText("Refund settled")).toBeDefined());
  });

  it("hides the CTA entirely for a terminal eligibility reason (already refunded)", async () => {
    mockGetRefundEligibility.mockResolvedValue({
      data: { escrowId: "42", eligible: false, reason: "refunded" },
      error: null,
    });

    render(<RefundRequestPanel order={makeOrder()} />);

    await waitFor(() => expect(mockGetRefundEligibility).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Request refund" })).toBeNull();
  });

  it("shows an error and allows retry when the submission fails", async () => {
    mockGetRefundEligibility.mockResolvedValue({
      data: { escrowId: "42", eligible: true, reason: "ok" },
      error: null,
    });
    mockSubmitRefundRequest.mockResolvedValue({
      data: null,
      error: { code: "ESCROW_REFUND_FAILED", message: "Wallet service unavailable" },
    });

    render(<RefundRequestPanel order={makeOrder()} />);

    const button = await screen.findByRole("button", { name: "Request refund" });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText("Wallet service unavailable")).toBeDefined());
    expect(screen.getByText("Refund failed")).toBeDefined();
    // Not terminal on failure — the CTA is still available to retry.
    expect(screen.getByRole("button", { name: "Request refund" })).not.toBeDisabled();
  });
});
