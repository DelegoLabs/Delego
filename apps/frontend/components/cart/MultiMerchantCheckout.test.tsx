import { cleanup, fireEvent, render, screen, waitFor, within, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultiMerchantCheckout, type EscrowReceipt } from "./MultiMerchantCheckout";

import { CartDrawer } from "./CartDrawer";

const cart = vi.hoisted(() => ({
  clearCart: vi.fn(),
  closeDrawer: vi.fn(),
  drawerOpen: true,
  removeItem: vi.fn(),
  setQuantity: vi.fn(),
  summary: { subtotalStroops: "30000000", totalQuantity: 3, items: ["a", "b", "c"].map(id => ({
    productId: id, merchantId: id, merchantName: `Merchant ${id}`,
    payoutAddress: "GADDRESS", title: `Product ${id}`, priceStroops: "10000000",
    quantity: 1, maxStock: 10,
  })) },
}));
vi.mock("../../hooks/useCart", () => ({ useCart: () => cart }));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
const receipt = (id: string) => ({ escrowId: `escrow-${id}`, txHash: `tx-${id}` });
async function authorize(id: string) {
  fireEvent.click(within(screen.getByTestId(`partition-card-${id}`)).getByRole("button", { name: "Authorize escrow" }));
  await waitFor(() => expect(within(screen.getByTestId(`partition-card-${id}`)).queryByText(/Awaiting signature/)).not.toBeInTheDocument());
}

describe("multi merchant recovery", () => {
  it("retries only the rejected merchant and completes once", async () => {
    const sign = vi.fn().mockResolvedValueOnce(receipt("a")).mockRejectedValueOnce(new Error("Rejected by wallet"))
      .mockResolvedValueOnce(receipt("b")).mockResolvedValueOnce(receipt("c"));
    const complete = vi.fn();
    render(<MultiMerchantCheckout signEscrow={sign} onComplete={complete} />);
    await authorize("a"); await authorize("b");
    expect(screen.getByText(/Checkout is incomplete/)).toHaveTextContent("1 confirmed escrow");
    expect(within(screen.getByTestId("partition-card-c")).queryByRole("button")).not.toBeInTheDocument();
    expect(cart.clearCart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry Signing" }));
    await waitFor(() => expect(within(screen.getByTestId("partition-card-b")).getByText("Confirmed")).toBeInTheDocument());
    await authorize("c");
    expect(sign.mock.calls.map(([p]) => p.merchantId)).toEqual(["a", "b", "b", "c"]);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(cart.clearCart).toHaveBeenCalledTimes(1);
  });

  it("retains successful refunds when a later refund fails", async () => {
    const sign = vi.fn().mockResolvedValueOnce(receipt("a")).mockResolvedValueOnce(receipt("b"))
      .mockRejectedValueOnce(new Error("Rejected"));
    const refund = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Refund rejected"))
      .mockResolvedValueOnce(undefined);
    const cancel = vi.fn();
    render(<MultiMerchantCheckout signEscrow={sign} refundEscrow={refund} onCancel={cancel} />);
    await authorize("a"); await authorize("b"); await authorize("c");
    fireEvent.click(screen.getByRole("button", { name: "Cancel & Refund Completed Escrows" }));
    await screen.findByText("Refund rejected");
    expect(cancel).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry Signing" })).toBeDisabled();
    expect(screen.getByText(/Merchant a: escrow-a/)).toHaveTextContent("Refunded");
    fireEvent.click(screen.getByRole("button", { name: "Cancel & Refund Completed Escrows" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(refund.mock.calls.map(([e]) => e.escrowId)).toEqual(["escrow-a", "escrow-b", "escrow-b"]);
    expect(cart.clearCart).not.toHaveBeenCalled();
  });

  it("locks signing and cancellation while awaiting the wallet", async () => {
    let resolve!: (receipt: EscrowReceipt) => void;
    const sign = vi.fn(() => new Promise<EscrowReceipt>(r => { resolve = r; }));
    const cancel = vi.fn();
    render(<MultiMerchantCheckout signEscrow={sign} onCancel={cancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Authorize escrow" }));
    expect(screen.getByRole("button", { name: "Cancel checkout" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Authorize escrow" })).not.toBeInTheDocument();
    await act(async () => resolve(receipt("a")));
    expect(sign).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("does not fake refunds when the handler is missing", async () => {
    const cancel = vi.fn();
    render(<MultiMerchantCheckout signEscrow={vi.fn().mockResolvedValue(receipt("a"))} onCancel={cancel} />);
    await authorize("a");
    fireEvent.click(screen.getByRole("button", { name: "Cancel & Refund Completed Escrows" }));
    expect(await screen.findByText(/Refunds are not connected/)).toBeInTheDocument();
    expect(screen.getByText(/Merchant a: escrow-a/)).toHaveTextContent("tx-a");
    expect(cancel).not.toHaveBeenCalled();
  });

  it("fails closed without a signer", async () => {
    render(<MultiMerchantCheckout />);
    await authorize("a");
    expect(screen.getByText(/Escrow signing is not connected/)).toBeInTheDocument();
    expect(cart.clearCart).not.toHaveBeenCalled();
  });
  it("keeps recovery guarded until a pending refund confirms", async () => {
    let finish!: () => void;
    const refund = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const guard = vi.fn();
    const cancel = vi.fn();
    render(<MultiMerchantCheckout signEscrow={vi.fn().mockResolvedValue(receipt("a"))}
      refundEscrow={refund} onCancel={cancel} onRecoveryRequiredChange={guard} />);
    await authorize("a");
    expect(guard).toHaveBeenLastCalledWith(true);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel & Refund Completed Escrows" }));
    expect(screen.getByRole("button", { name: "Refunding..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Authorize escrow" })).toBeDisabled();
    expect(cancel).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(guard).toHaveBeenLastCalledWith(false);
  });

  it("allows cancellation after the first signature is rejected without refunding", async () => {
    const cancel = vi.fn();
    const refund = vi.fn();
    render(<MultiMerchantCheckout signEscrow={vi.fn().mockRejectedValue(new Error("Rejected"))}
      refundEscrow={refund} onCancel={cancel} />);
    await authorize("a");
    fireEvent.click(screen.getByRole("button", { name: "Cancel checkout" }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(refund).not.toHaveBeenCalled();
    expect(cart.clearCart).not.toHaveBeenCalled();
  });

  it("guards drawer dismissal and releases the guard after refunds", async () => {
    render(<CartDrawer signEscrow={vi.fn().mockResolvedValue(receipt("a"))}
      refundEscrow={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByTestId("proceed-to-checkout"));
    await authorize("a");
    expect(screen.getByRole("button", { name: "Close cart" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(cart.closeDrawer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel & Refund Completed Escrows" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Close cart" })).toBeEnabled());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(cart.closeDrawer).toHaveBeenCalledTimes(1);
  });

});
