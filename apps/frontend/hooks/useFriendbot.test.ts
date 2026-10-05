import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useFriendbot, type FaucetFundResponse } from "./useFriendbot";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useFriendbot", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useFriendbot());
    expect(result.current.status).toBe("idle");
  });

  it("funds an address and reports the transaction hash", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hash: "tx-hash-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFriendbot());

    let response: FaucetFundResponse | undefined;
    await act(async () => {
      response = await result.current.fund("GABC123");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://friendbot.stellar.org?addr=GABC123"
    );
    expect(response).toEqual({
      success: true,
      transactionHash: "tx-hash-1",
      fundedAmountXlm: "10000",
    });
    expect(result.current.status).toBe("done");
  });

  it("encodes the address in the query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hash: "tx-hash-2" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFriendbot());
    await act(async () => {
      await result.current.fund("G + SPECIAL/CHARS");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://friendbot.stellar.org?addr=G%20%2B%20SPECIAL%2FCHARS"
    );
  });

  it("surfaces the API detail message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ detail: "already funded" }),
      })
    );

    const { result } = renderHook(() => useFriendbot());

    let response: FaucetFundResponse | undefined;
    await act(async () => {
      response = await result.current.fund("GABC123");
    });

    expect(response).toEqual({
      success: false,
      fundedAmountXlm: "0",
      errorMessage: "already funded",
    });
    expect(result.current.status).toBe("error");
  });

  it("falls back to a status message when the error carries no detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      })
    );

    const { result } = renderHook(() => useFriendbot());

    let response: FaucetFundResponse | undefined;
    await act(async () => {
      response = await result.current.fund("GABC123");
    });

    expect(response?.errorMessage).toBe("Friendbot request failed (503).");
  });

  it("reports a network failure without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    const { result } = renderHook(() => useFriendbot());

    let response: FaucetFundResponse | undefined;
    await act(async () => {
      response = await result.current.fund("GABC123");
    });

    expect(response).toEqual({
      success: false,
      fundedAmountXlm: "0",
      errorMessage: "network down",
    });
    expect(result.current.status).toBe("error");
  });

  it("falls back to a generic message for a non-Error rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("nope"));

    const { result } = renderHook(() => useFriendbot());

    let response: FaucetFundResponse | undefined;
    await act(async () => {
      response = await result.current.fund("GABC123");
    });

    expect(response?.errorMessage).toBe("Friendbot request failed.");
  });
});