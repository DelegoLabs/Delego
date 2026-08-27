import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { CancellationGrace } from "@delegolabs/types";
import { useCancelGrace } from "./useCancelGrace";

const mockUndo = vi.fn();
const mockFinalize = vi.fn();
const mockRequest = vi.fn();

vi.mock("../services/payments", () => ({
  undoCancellation: (...args: unknown[]) => mockUndo(...args),
  finalizeCancellation: (...args: unknown[]) => mockFinalize(...args),
  requestCancellation: (...args: unknown[]) => mockRequest(...args),
}));

function makeGrace(overrides: Partial<CancellationGrace> = {}): CancellationGrace {
  return {
    requestedAt: "2026-01-01T00:00:00.000Z",
    gracePeriodSeconds: 30,
    graceExpiresAt: "2026-01-01T00:00:30.000Z",
    serverTimestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("useCancelGrace", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    window.localStorage.clear();
    mockUndo.mockReset();
    mockFinalize.mockReset();
    mockRequest.mockReset();
    mockFinalize.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes a countdown against the server-issued expiry, corrected for client clock skew", () => {
    // Client clock reads 10s ahead of the server at the moment the grace
    // payload is received.
    vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));
    const { result } = renderHook(() =>
      useCancelGrace({ escrowId: "escrow-1", serverGrace: makeGrace() })
    );
    // Real server-relative time elapsed since receipt is 0s, so 30s should
    // remain regardless of the client clock being 10s fast.
    expect(result.current.remainingMs).toBe(30_000);
  });

  it("persists the active grace to localStorage so it survives a reload", () => {
    renderHook(() => useCancelGrace({ escrowId: "escrow-1", serverGrace: makeGrace() }));
    const stored = window.localStorage.getItem("delego:cancel-grace:escrow-1");
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string).gracePeriodSeconds).toBe(30);
  });

  it("rehydrates a persisted grace banner on mount before any server payload arrives", () => {
    window.localStorage.setItem(
      "delego:cancel-grace:escrow-1",
      JSON.stringify(makeGrace())
    );
    const { result } = renderHook(() => useCancelGrace({ escrowId: "escrow-1" }));
    expect(result.current.grace).not.toBeNull();
  });

  it("optimistically restores immediately on undo, before the request resolves", async () => {
    let resolveUndo: (value: unknown) => void = () => {};
    mockUndo.mockReturnValue(
      new Promise((resolve) => {
        resolveUndo = resolve;
      })
    );

    const { result } = renderHook(() =>
      useCancelGrace({ escrowId: "escrow-1", serverGrace: makeGrace() })
    );
    expect(result.current.grace).not.toBeNull();

    act(() => {
      void result.current.undo();
    });

    // Cleared immediately, before the network call resolves.
    expect(result.current.grace).toBeNull();
    expect(result.current.undoing).toBe(true);

    await act(async () => {
      resolveUndo({ data: { id: "escrow-1", status: "funded", cancellation: null }, error: null });
      await Promise.resolve();
    });

    expect(result.current.undoing).toBe(false);
    expect(result.current.grace).toBeNull();
  });

  it("rolls back the optimistic restore if the undo request fails", async () => {
    mockUndo.mockResolvedValue({ data: null, error: { code: "network_error", message: "offline" } });
    const { result } = renderHook(() =>
      useCancelGrace({ escrowId: "escrow-1", serverGrace: makeGrace() })
    );

    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.grace).not.toBeNull();
    expect(result.current.error).toMatch(/offline/);
  });

  it("resolves the undo-vs-expiration race in the server's favor: finalize wins when undo arrives too late", async () => {
    mockUndo.mockResolvedValue({
      data: { id: "escrow-1", status: "cancelled", cancellation: null },
      error: null,
    });
    const onFinalized = vi.fn();
    const { result } = renderHook(() =>
      useCancelGrace({ escrowId: "escrow-1", serverGrace: makeGrace(), onFinalized })
    );

    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.grace).toBeNull();
    expect(result.current.error).toMatch(/already finalized/i);
    expect(onFinalized).toHaveBeenCalledWith("escrow-1");
  });

  it("calls onRestored and clears storage once undo is confirmed", async () => {
    mockUndo.mockResolvedValue({ data: { id: "escrow-1", status: "funded", cancellation: null }, error: null });
    const onRestored = vi.fn();
    const { result } = renderHook(() =>
      useCancelGrace({ escrowId: "escrow-1", serverGrace: makeGrace(), onRestored })
    );

    await act(async () => {
      await result.current.undo();
    });

    expect(onRestored).toHaveBeenCalledWith("escrow-1");
    expect(window.localStorage.getItem("delego:cancel-grace:escrow-1")).toBeNull();
  });

  it("finalizes and appends a permanent timeline event once the countdown lapses without an undo", async () => {
    const onFinalized = vi.fn();
    const { result } = renderHook(() =>
      useCancelGrace({ escrowId: "escrow-1", serverGrace: makeGrace(), onFinalized, tickMs: 1000 })
    );
    expect(result.current.grace).not.toBeNull();

    await act(async () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:31.000Z"));
      vi.advanceTimersByTime(31_000);
      await vi.runOnlyPendingTimersAsync();
    });

    await waitFor(() => expect(result.current.grace).toBeNull());
    expect(mockFinalize).toHaveBeenCalledWith("escrow-1");
    expect(onFinalized).toHaveBeenCalledWith("escrow-1");

    const stored = window.localStorage.getItem("delego:escrow-timeline:escrow-1");
    expect(stored).not.toBeNull();
    const entries = JSON.parse(stored as string);
    expect(entries.some((e: { type: string }) => e.type === "cancel_finalized")).toBe(true);
  });
});
