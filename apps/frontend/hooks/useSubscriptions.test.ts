import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSubscriptions } from "./useSubscriptions";

const mockApiFetch = vi.fn();

vi.mock("../lib/apiFetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const sub = {
  subscriptionId: "sub_1",
  merchantName: "Coffee",
  itemTitle: "Beans",
  intervalDays: 14,
  amountStroops: "2500",
  nextExecutionDate: "2026-10-09",
  status: "active",
};

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe("useSubscriptions", () => {
  it("loads subscriptions from the API", async () => {
    mockApiFetch.mockResolvedValue({ data: [sub], error: null });
    const { result } = renderHook(() => useSubscriptions());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockApiFetch).toHaveBeenCalledWith("/subscriptions");
    expect(result.current.subscriptions).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("surfaces load errors", async () => {
    mockApiFetch.mockResolvedValue({ data: null, error: { code: "500", message: "down" } });
    const { result } = renderHook(() => useSubscriptions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("down");
    expect(result.current.subscriptions).toEqual([]);
  });

  it("applies the new status after a successful action", async () => {
    mockApiFetch.mockResolvedValueOnce({ data: [sub], error: null });
    const { result } = renderHook(() => useSubscriptions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockApiFetch.mockResolvedValueOnce({ data: null, error: null });
    let ok = false;
    await act(async () => {
      ok = await result.current.runAction("sub_1", "pause");
    });
    expect(ok).toBe(true);
    expect(mockApiFetch).toHaveBeenLastCalledWith("/subscriptions/sub_1/pause", { method: "POST" });
    expect(result.current.subscriptions[0].status).toBe("paused");
    expect(result.current.pendingIds.size).toBe(0);
  });

  it("keeps status and sets error when an action fails", async () => {
    mockApiFetch.mockResolvedValueOnce({ data: [sub], error: null });
    const { result } = renderHook(() => useSubscriptions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockApiFetch.mockResolvedValueOnce({ data: null, error: { code: "400", message: "nope" } });
    let ok = true;
    await act(async () => {
      ok = await result.current.runAction("sub_1", "cancel");
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe("nope");
    expect(result.current.subscriptions[0].status).toBe("active");
  });
});
