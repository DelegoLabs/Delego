import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { usePendingApprovals } from "./usePendingApprovals";
import {
  resetPendingApprovalStore,
  setPendingApprovalItems,
} from "../lib/pendingApprovalStore";
import { adaptPendingApprovals } from "../lib/pendingApprovals";

const mockFetch = vi.fn();
const mockSubmitApproval = vi.fn();
vi.mock("../services/approvals", () => ({
  fetchPendingApprovals: () => mockFetch(),
  submitApproval: (...args: unknown[]) => mockSubmitApproval(...args),
}));

const mockUseWallet = vi.fn();
vi.mock("./useWallet", () => ({ useWallet: () => mockUseWallet() }));

const FUTURE = new Date("2999-01-01T00:00:00Z");

function dto(orderId: string) {
  return {
    orderId,
    requestedBy: "wallet-a",
    amountStroops: "50000000000",
    recipient: "wallet-b",
    expiresAt: FUTURE.toISOString(),
  };
}

describe("usePendingApprovals", () => {
  beforeEach(() => {
    resetPendingApprovalStore();
    mockFetch.mockReset();
    mockSubmitApproval.mockReset();
    mockUseWallet.mockReturnValue({ address: "wallet-signer" });
    mockFetch.mockResolvedValue({
      data: [dto("ord_1"), dto("ord_2")],
      error: null,
    });
  });

  afterEach(() => {
    resetPendingApprovalStore();
  });

  it("loads and adapts the queue once", async () => {
    const { result } = renderHook(() => usePendingApprovals());

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.items[0]).toEqual({
      orderId: "ord_1",
      requestedBy: "wallet-a",
      amountStroops: 50_000_000_000n,
      recipient: "wallet-b",
      expiresAt: FUTURE,
    });
  });

  it("surfaces a load failure as an error message", async () => {
    mockFetch.mockResolvedValue({
      data: null,
      error: { code: "network_error", message: "offline" },
    });

    const { result } = renderHook(() => usePendingApprovals());

    await waitFor(() => expect(result.current.error).toBe("offline"));
    expect(result.current.items).toEqual([]);
  });

  it("approves and signs in one call, dropping the row from the queue", async () => {
    mockSubmitApproval.mockResolvedValue({ data: { id: "ord_1" }, error: null });
    const { result } = renderHook(() => usePendingApprovals());
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    let ok = false;
    await act(async () => {
      ok = await result.current.sign("ord_1");
    });

    expect(ok).toBe(true);
    expect(mockSubmitApproval).toHaveBeenCalledWith("ord_1", "wallet-signer");
    expect(result.current.items.map((i) => i.orderId)).toEqual(["ord_2"]);
    expect(result.current.signingIds.size).toBe(0);
  });

  it("keeps the row and reports the error when the server rejects the signature", async () => {
    mockSubmitApproval.mockResolvedValue({
      data: null,
      error: { code: "not_authorized", message: "Signer is not on this delegation" },
    });
    const { result } = renderHook(() => usePendingApprovals());
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    let ok = true;
    await act(async () => {
      ok = await result.current.sign("ord_1");
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("Signer is not on this delegation");
    expect(result.current.items).toHaveLength(2);
  });

  it("refuses to sign with no connected wallet, without calling the API", async () => {
    mockUseWallet.mockReturnValue({ address: null });
    const { result } = renderHook(() => usePendingApprovals());
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    let ok = true;
    await act(async () => {
      ok = await result.current.sign("ord_1");
    });

    expect(ok).toBe(false);
    expect(mockSubmitApproval).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/Connect your wallet/);
  });

  it("reloads the queue on a manual refresh", async () => {
    const { result } = renderHook(() => usePendingApprovals());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockResolvedValue({ data: [dto("ord_9")], error: null });
    await act(async () => {
      await result.current.refresh();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.items.map((i) => i.orderId)).toEqual(["ord_9"]);
  });

  it("adopts an already-loaded shared queue instead of showing an empty one", async () => {
    // The nav badge loads first; the dashboard must not re-request or blank out.
    setPendingApprovalItems(adaptPendingApprovals([dto("ord_shared")]));

    const { result } = renderHook(() => usePendingApprovals());

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});
