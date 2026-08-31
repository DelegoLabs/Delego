import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NetworkProvider } from "./useNetwork";
import { useReceiptVerification } from "./useReceiptVerification";
import * as receiptGetters from "../services/receiptGetters";

const CONTRACT = "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR";

function Providers({ children }: { children: React.ReactNode }) {
  return <NetworkProvider>{children}</NetworkProvider>;
}

describe("useReceiptVerification", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stays idle when contractAddress is null", () => {
    const { result } = renderHook(
      () => useReceiptVerification("buyer", "escrow-1", null, {}, []),
      { wrapper: Providers }
    );
    expect(result.current.status).toBe("idle");
  });

  it("transitions loading -> loaded and computes the comparison", async () => {
    vi.spyOn(receiptGetters, "fetchReceipt").mockResolvedValue({
      ok: true,
      result: { kind: "buyer", data: { amount: "100" } },
    });

    const { result } = renderHook(
      () =>
        useReceiptVerification(
          "buyer",
          "escrow-1",
          CONTRACT,
          { amount: "100" },
          ["amount"]
        ),
      { wrapper: Providers }
    );

    await waitFor(() => expect(result.current.status).toBe("loaded"));
    expect(result.current.comparison?.matches).toBe(true);
    expect(result.current.receipt?.data.amount).toBe("100");
  });

  it("transitions loading -> error and exposes the error message", async () => {
    vi.spyOn(receiptGetters, "fetchReceipt").mockResolvedValue({
      ok: false,
      error: "boom",
    });

    const { result } = renderHook(
      () => useReceiptVerification("buyer", "escrow-1", CONTRACT, {}, []),
      { wrapper: Providers }
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("boom");
    expect(result.current.receipt).toBeNull();
  });

  it("refresh() re-fetches with bypassCache=true", async () => {
    const spy = vi.spyOn(receiptGetters, "fetchReceipt").mockResolvedValue({
      ok: true,
      result: { kind: "buyer", data: { amount: "100" } },
    });

    const { result } = renderHook(
      () =>
        useReceiptVerification(
          "buyer",
          "escrow-1",
          CONTRACT,
          { amount: "100" },
          ["amount"]
        ),
      { wrapper: Providers }
    );

    await waitFor(() => expect(result.current.status).toBe("loaded"));
    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1][5]).toBe(true);
  });

  it("re-fetches when the receipt key changes", async () => {
    const spy = vi.spyOn(receiptGetters, "fetchReceipt").mockResolvedValue({
      ok: true,
      result: { kind: "buyer", data: { amount: "100" } },
    });

    const { rerender } = renderHook(
      ({ key }: { key: string }) =>
        useReceiptVerification("buyer", key, CONTRACT, { amount: "100" }, [
          "amount",
        ]),
      { wrapper: Providers, initialProps: { key: "escrow-1" } }
    );

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender({ key: "escrow-2" });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1][4]).toBe("escrow-2");
  });
});
