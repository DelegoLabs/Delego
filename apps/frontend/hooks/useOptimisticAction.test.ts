import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOptimisticAction } from "./useOptimisticAction";

describe("useOptimisticAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies optimistic state immediately", () => {
    const { result } = renderHook(() =>
      useOptimisticAction({ status: "active" })
    );

    expect(result.current.state).toEqual({ status: "active" });

    act(() => {
      void result.current.execute({
        type: "UPDATE_STATUS",
        previousState: { status: "active" },
        optimisticState: { status: "cancelled" },
        txHashPromise: new Promise(() => {}), // never resolves
      });
    });

    expect(result.current.state).toEqual({ status: "cancelled" });
    expect(result.current.pending).toBe(true);
  });

  it("keeps optimistic state when transaction succeeds", async () => {
    const { result } = renderHook(() =>
      useOptimisticAction({ status: "active" })
    );

    await act(async () => {
      await result.current.execute({
        type: "UPDATE_STATUS",
        previousState: { status: "active" },
        optimisticState: { status: "cancelled" },
        txHashPromise: Promise.resolve("tx-hash-123"),
      });
    });

    expect(result.current.state).toEqual({ status: "cancelled" });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("rolls back to previous state when transaction fails", async () => {
    const onRollback = vi.fn();
    const onRefetch = vi.fn();
    const onWarning = vi.fn();

    const { result } = renderHook(() =>
      useOptimisticAction({ status: "active" }, { onRollback, onRefetch, onWarning })
    );

    await act(async () => {
      await result.current.execute({
        type: "UPDATE_STATUS",
        previousState: { status: "active" },
        optimisticState: { status: "cancelled" },
        txHashPromise: Promise.reject(new Error("Transaction reverted")),
      });
    });

    // State should be rolled back
    expect(result.current.state).toEqual({ status: "active" });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe("Transaction reverted");

    // Callbacks should have been called
    expect(onRollback).toHaveBeenCalledWith(
      { status: "active" },
      expect.any(Error)
    );
    expect(onRefetch).toHaveBeenCalled();
    expect(onWarning).toHaveBeenCalledWith("Transaction reverted");
  });

  it("calls onRefetch after rollback to get fresh state", async () => {
    const onRefetch = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useOptimisticAction({ status: "active" }, { onRefetch })
    );

    await act(async () => {
      await result.current.execute({
        type: "UPDATE_STATUS",
        previousState: { status: "active" },
        optimisticState: { status: "cancelled" },
        txHashPromise: Promise.reject(new Error("Failed")),
      });
    });

    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  it("resetState updates the state to a known value", () => {
    const { result } = renderHook(() =>
      useOptimisticAction({ status: "active" })
    );

    act(() => {
      result.current.resetState({ status: "refreshed" });
    });

    expect(result.current.state).toEqual({ status: "refreshed" });
  });

  it("handles non-Error rejections gracefully", async () => {
    const { result } = renderHook(() =>
      useOptimisticAction({ status: "active" })
    );

    await act(async () => {
      await result.current.execute({
        type: "UPDATE_STATUS",
        previousState: { status: "active" },
        optimisticState: { status: "cancelled" },
        txHashPromise: Promise.reject("string error"),
      });
    });

    expect(result.current.state).toEqual({ status: "active" });
    expect(result.current.error).toBe("Transaction failed");
  });
});
