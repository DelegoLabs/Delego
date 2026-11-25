import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSubscriptions } from "./useSubscriptions";
import type { SubscriptionPlan } from "../lib/subscriptions";

const mockApiFetch = vi.fn();

vi.mock("../lib/apiFetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const sub1: SubscriptionPlan = {
  subscriptionId: "sub_1",
  merchantName: "Coffee",
  itemTitle: "Beans",
  intervalDays: 14,
  amountStroops: "2500",
  nextExecutionDate: "2026-10-09",
  status: "active",
};

const sub2: SubscriptionPlan = {
  subscriptionId: "sub_2",
  merchantName: "Tea House",
  itemTitle: "Matcha",
  intervalDays: 30,
  amountStroops: "5000",
  nextExecutionDate: "2026-10-20",
  status: "paused",
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe("useSubscriptions", () => {
  it("loads subscriptions from the API", async () => {
    mockApiFetch.mockResolvedValue({ data: [sub1], error: null });
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

  it("optimistically updates status and tracks per-item pending flag while in-flight", async () => {
    mockApiFetch.mockResolvedValueOnce({ data: [sub1, sub2], error: null });
    const { result } = renderHook(() => useSubscriptions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const deferred = createDeferred<{ data: SubscriptionPlan | null; error: null }>();
    mockApiFetch.mockReturnValueOnce(deferred.promise);

    let actionPromise!: Promise<boolean>;
    act(() => {
      actionPromise = result.current.runAction("sub_1", "pause");
    });

    // Optimistic transition applied immediately before API resolves
    expect(result.current.subscriptions[0].status).toBe("paused");
    expect(result.current.subscriptions[1].status).toBe("paused");
    expect(result.current.pendingIds.has("sub_1")).toBe(true);
    expect(result.current.isPending("sub_1")).toBe(true);
    expect(result.current.isPending("sub_2")).toBe(false);

    await act(async () => {
      deferred.resolve({
        data: { ...sub1, status: "paused", nextExecutionDate: "2026-11-01" },
        error: null,
      });
      const ok = await actionPromise;
      expect(ok).toBe(true);
    });

    expect(mockApiFetch).toHaveBeenLastCalledWith("/subscriptions/sub_1/pause", { method: "POST" });
    expect(result.current.subscriptions[0].status).toBe("paused");
    expect(result.current.subscriptions[0].nextExecutionDate).toBe("2026-11-01");
    expect(result.current.pendingIds.size).toBe(0);
    expect(result.current.isPending("sub_1")).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("optimistically transitions resume and cancel actions", async () => {
    mockApiFetch.mockResolvedValueOnce({ data: [sub1, sub2], error: null });
    const { result } = renderHook(() => useSubscriptions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Resume sub_2 (paused -> active)
    const resumeDeferred = createDeferred<{ data: null; error: null }>();
    mockApiFetch.mockReturnValueOnce(resumeDeferred.promise);

    let resumePromise!: Promise<boolean>;
    act(() => {
      resumePromise = result.current.runAction("sub_2", "resume");
    });
    expect(result.current.subscriptions[1].status).toBe("active");
    expect(result.current.isPending("sub_2")).toBe(true);

    await act(async () => {
      resumeDeferred.resolve({ data: null, error: null });
      expect(await resumePromise).toBe(true);
    });
    expect(result.current.subscriptions[1].status).toBe("active");
    expect(result.current.isPending("sub_2")).toBe(false);

    // Cancel sub_1 (active -> cancelled)
    const cancelDeferred = createDeferred<{ data: null; error: null }>();
    mockApiFetch.mockReturnValueOnce(cancelDeferred.promise);

    let cancelPromise!: Promise<boolean>;
    act(() => {
      cancelPromise = result.current.runAction("sub_1", "cancel");
    });
    expect(result.current.subscriptions[0].status).toBe("cancelled");
    expect(result.current.isPending("sub_1")).toBe(true);

    await act(async () => {
      cancelDeferred.resolve({ data: null, error: null });
      expect(await cancelPromise).toBe(true);
    });
    expect(result.current.subscriptions[0].status).toBe("cancelled");
    expect(result.current.isPending("sub_1")).toBe(false);
  });

  it("rolls back status, clears pending flag, sets error, and notifies onError on API error", async () => {
    mockApiFetch.mockResolvedValueOnce({ data: [sub1], error: null });
    const onError = vi.fn();
    const { result } = renderHook(() => useSubscriptions({ onError }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const deferred = createDeferred<{ data: null; error: { code: string; message: string } }>();
    mockApiFetch.mockReturnValueOnce(deferred.promise);

    let actionPromise!: Promise<boolean>;
    act(() => {
      actionPromise = result.current.runAction("sub_1", "cancel");
    });

    // Optimistically cancelled while in-flight
    expect(result.current.subscriptions[0].status).toBe("cancelled");
    expect(result.current.isPending("sub_1")).toBe(true);

    await act(async () => {
      deferred.resolve({ data: null, error: { code: "400", message: "nope" } });
      const ok = await actionPromise;
      expect(ok).toBe(false);
    });

    // Rolled back to active
    expect(result.current.subscriptions[0].status).toBe("active");
    expect(result.current.isPending("sub_1")).toBe(false);
    expect(result.current.pendingIds.size).toBe(0);
    expect(result.current.error).toBe("nope");
    expect(onError).toHaveBeenCalledWith("nope", { subscriptionId: "sub_1", action: "cancel" });

    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });

  it("rolls back only the failed item without clobbering concurrent updates to other items", async () => {
    mockApiFetch.mockResolvedValueOnce({ data: [sub1, sub2], error: null });
    const { result } = renderHook(() => useSubscriptions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const d1 = createDeferred<{ data: null; error: { code: string; message: string } }>();
    const d2 = createDeferred<{ data: null; error: null }>();
    mockApiFetch.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);

    let p1!: Promise<boolean>;
    let p2!: Promise<boolean>;
    act(() => {
      p1 = result.current.runAction("sub_1", "pause");
      p2 = result.current.runAction("sub_2", "resume");
    });

    expect(result.current.subscriptions[0].status).toBe("paused");
    expect(result.current.subscriptions[1].status).toBe("active");
    expect(result.current.isPending("sub_1")).toBe(true);
    expect(result.current.isPending("sub_2")).toBe(true);

    // sub_2 succeeds first
    await act(async () => {
      d2.resolve({ data: null, error: null });
      expect(await p2).toBe(true);
    });
    expect(result.current.isPending("sub_2")).toBe(false);
    expect(result.current.isPending("sub_1")).toBe(true);

    // sub_1 fails and rolls back
    await act(async () => {
      d1.resolve({ data: null, error: { code: "500", message: "server error" } });
      expect(await p1).toBe(false);
    });

    expect(result.current.subscriptions[0].status).toBe("active");
    expect(result.current.subscriptions[1].status).toBe("active");
    expect(result.current.pendingIds.size).toBe(0);
    expect(result.current.error).toBe("server error");
  });

  it("ignores duplicate concurrent actions for the same subscription", async () => {
    mockApiFetch.mockResolvedValueOnce({ data: [sub1], error: null });
    const { result } = renderHook(() => useSubscriptions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const deferred = createDeferred<{ data: null; error: null }>();
    mockApiFetch.mockReturnValueOnce(deferred.promise);

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.runAction("sub_1", "pause");
      second = result.current.runAction("sub_1", "cancel");
    });

    await expect(second).resolves.toBe(false);
    // Only 1 initial load + 1 pause request
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.subscriptions[0].status).toBe("paused");

    await act(async () => {
      deferred.resolve({ data: null, error: null });
      expect(await first).toBe(true);
    });
    expect(result.current.subscriptions[0].status).toBe("paused");
  });
});
