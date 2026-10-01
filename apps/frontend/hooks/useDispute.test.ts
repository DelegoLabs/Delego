import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Dispute } from "@delegolabs/types";

import { useDispute } from "./useDispute";

const mockApiFetch = vi.fn();

vi.mock("../lib/apiFetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const dispute: Dispute = {
  id: "dispute-1",
  escrowId: "escrow-1",
  status: "open",
  reason: "Item not as described",
  createdAt: "2024-01-01T00:00:00Z",
} as Dispute;

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({ data: null, error: null });
});

describe("useDispute", () => {
  it("fetches the current dispute on mount", async () => {
    mockApiFetch.mockResolvedValue({ data: dispute, error: null });

    const { result } = renderHook(() => useDispute("escrow-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockApiFetch).toHaveBeenCalledWith("/escrows/escrow-1/disputes/current");
    expect(result.current.dispute).toEqual(dispute);
  });

  it("skips the fetch and settles when there is no escrow id", async () => {
    const { result } = renderHook(() => useDispute(undefined));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.dispute).toBeNull();
  });

  it("surfaces a fetch error message", async () => {
    mockApiFetch.mockResolvedValue({
      data: null,
      error: { code: "not_found", message: "Dispute unavailable" },
    });

    const { result } = renderHook(() => useDispute("escrow-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Dispute unavailable");
  });

  it("surfaces a thrown fetch failure", async () => {
    mockApiFetch.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useDispute("escrow-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("network down");
  });

  it("opens a dispute and flags the optimistic state", async () => {
    mockApiFetch
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: dispute, error: null });

    const { result } = renderHook(() => useDispute("escrow-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let opened: Dispute | null = null;
    await act(async () => {
      opened = await result.current.openDispute({ reason: "Item not as described" });
    });

    expect(mockApiFetch).toHaveBeenLastCalledWith(
      "/escrows/escrow-1/disputes",
      expect.objectContaining({ method: "POST" })
    );
    expect(opened).toEqual(dispute);
    expect(result.current.optimisticallyDisputed).toBe(true);
    expect(result.current.submitting).toBe(false);
  });

  it("returns null and records the error when the submit is rejected", async () => {
    mockApiFetch
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "conflict", message: "Dispute already open" },
      });

    const { result } = renderHook(() => useDispute("escrow-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let opened: Dispute | null = dispute;
    await act(async () => {
      opened = await result.current.openDispute({ reason: "Item not as described" });
    });

    expect(opened).toBeNull();
    expect(result.current.error).toBe("Dispute already open");
    expect(result.current.optimisticallyDisputed).toBe(false);
  });

  it("records the error when the submit throws", async () => {
    mockApiFetch
      .mockResolvedValueOnce({ data: null, error: null })
      .mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useDispute("escrow-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.openDispute({ reason: "Item not as described" });
    });

    expect(result.current.error).toBe("network down");
  });

  it("no-ops on openDispute without an escrow id", async () => {
    const { result } = renderHook(() => useDispute(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let opened: Dispute | null = dispute;
    await act(async () => {
      opened = await result.current.openDispute({ reason: "Item not as described" });
    });

    expect(opened).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("blocks reopening while a dispute already exists", async () => {
    mockApiFetch.mockResolvedValue({ data: dispute, error: null });

    const { result } = renderHook(() => useDispute("escrow-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canOpen("Funded")).toBe(false);
  });

  it("allows opening for an eligible escrow with no dispute", async () => {
    const { result } = renderHook(() => useDispute("escrow-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canOpen("Funded")).toBe(true);
  });

  it("blocks opening for an ineligible escrow status", async () => {
    const { result } = renderHook(() => useDispute("escrow-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canOpen("Released")).toBe(false);
  });

  it("refetches on refresh", async () => {
    const { result } = renderHook(() => useDispute("escrow-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockApiFetch.mockResolvedValue({ data: dispute, error: null });
    await act(async () => {
      await result.current.refresh();
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.dispute).toEqual(dispute);
  });
});