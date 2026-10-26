import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../lib/offlineCache", () => ({
  listCachedReads: vi.fn(),
}));

import { listCachedReads } from "../lib/offlineCache";
import { clearQueue, enqueueMutation } from "../lib/offlineQueue";
import { useOnlineStatus, OFFLINE_BLOCKED_MESSAGE } from "./useOnlineStatus";

const mockedListCachedReads = vi.mocked(listCachedReads);

/** Stub `navigator.onLine` (jsdom reports `true`, not writable directly). */
function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

describe("useOnlineStatus (#773)", () => {
  beforeEach(async () => {
    await clearQueue();
    mockedListCachedReads.mockResolvedValue([]);
    setOnline(true);
  });

  afterEach(async () => {
    await clearQueue();
    vi.clearAllMocks();
  });

  it("reports online with no disabled props by default", async () => {
    const { result } = renderHook(() => useOnlineStatus());
    await waitFor(() => expect(result.current.connectionStatus).toBe("online"));
    expect(result.current.disabledProps).toEqual({});
  });

  it("flips offline on the window `offline` event and back on `online`, exposing disabled props", async () => {
    const { result } = renderHook(() => useOnlineStatus());
    await waitFor(() => expect(mockedListCachedReads).toHaveBeenCalled());

    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.connectionStatus).toBe("offline");
    expect(result.current.connectivityState.isOnline).toBe(false);
    expect(result.current.disabledProps).toEqual({
      disabled: true,
      title: OFFLINE_BLOCKED_MESSAGE,
    });

    await act(async () => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.connectionStatus).toBe("online");
    expect(result.current.connectivityState.isOnline).toBe(true);
    expect(result.current.connectivityState.lastConnectedTimestamp).toBeGreaterThan(0);
    expect(result.current.disabledProps).toEqual({});
  });

  it("derives cachedOrdersCount and lastSyncedAt from the offline cache", async () => {
    const older = new Date("2026-01-01T00:00:00Z");
    const newer = new Date("2026-02-01T00:00:00Z");
    mockedListCachedReads.mockResolvedValue([
      { url: "/orders", label: "Orders", cachedAt: older },
      { url: "/delegations", label: "Delegations", cachedAt: newer },
    ]);

    const { result } = renderHook(() => useOnlineStatus());

    await waitFor(() => expect(result.current.cachedOrdersCount).toBe(1));
    expect(result.current.lastSyncedAt).toEqual(newer);
  });

  it("reports the number of queued actions waiting to replay", async () => {
    await enqueueMutation("approve_order", "order-queued");
    const { result } = renderHook(() => useOnlineStatus());

    await waitFor(() =>
      expect(result.current.connectivityState.queuedActionCount).toBe(1)
    );
  });
});
