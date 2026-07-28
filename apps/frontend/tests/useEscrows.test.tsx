import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useEscrows } from "../hooks/useEscrows";
import type { Escrow } from "@delego/types";

// Mock the API client
vi.mock("../lib/api", () => ({
  api: {
    getEscrows: vi.fn(),
  },
}));

import { api } from "../lib/api";

const mockedGetEscrows = vi.mocked(api.getEscrows);

const sampleEscrows: Escrow[] = [
  {
    escrowId: "1",
    buyer: "GBUYER1…BUYER1",
    seller: "GSELLER1…SELLER1",
    token: "CTOKEN1…TOKEN1",
    amount: "5000000000",
    status: "Funded",
    orderId: "ff".repeat(32),
    createdAt: "2026-07-20T10:00:00.000Z",
    timeoutLedger: 6_000_000,
    currentLedger: 5_999_000,
  },
  {
    escrowId: "2",
    buyer: "GBUYER2…BUYER2",
    seller: "GSELLER2…SELLER2",
    token: "CTOKEN2…TOKEN2",
    amount: "7500000000",
    status: "Released",
    orderId: "ee".repeat(32),
    createdAt: "2026-07-19T08:30:00.000Z",
    timeoutLedger: 5_800_000,
    currentLedger: 5_900_000,
  },
];

describe("useEscrows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading=true initially", () => {
    mockedGetEscrows.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useEscrows());

    expect(result.current.loading).toBe(true);
    expect(result.current.escrows).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("fetches escrows successfully and returns data", async () => {
    mockedGetEscrows.mockResolvedValue({ data: sampleEscrows, error: null });

    const { result } = renderHook(() => useEscrows());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.escrows).toEqual(sampleEscrows);
    expect(result.current.error).toBeNull();
  });

  it("handles empty escrow list", async () => {
    mockedGetEscrows.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useEscrows());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.escrows).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("handles API error response", async () => {
    mockedGetEscrows.mockResolvedValue({
      data: null,
      error: { code: "INTERNAL_ERROR", message: "Server error" },
    });

    const { result } = renderHook(() => useEscrows());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.escrows).toEqual([]);
    expect(result.current.error).toBe("Server error");
  });

  it("handles network failure", async () => {
    mockedGetEscrows.mockRejectedValue(new Error("Network failure"));

    const { result } = renderHook(() => useEscrows());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.escrows).toEqual([]);
    expect(result.current.error).toBe("Network failure");
  });

  it("handles non-Error rejection", async () => {
    mockedGetEscrows.mockRejectedValue("Unknown error");

    const { result } = renderHook(() => useEscrows());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.escrows).toEqual([]);
    expect(result.current.error).toBe("Failed to fetch escrows");
  });
});
