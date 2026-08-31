import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useErasureRequest } from "./useErasureRequest";

const mockRequestDataErasure = vi.fn();
const mockCancelDataErasure = vi.fn();
vi.mock("../services/erasure", () => ({
  requestDataErasure: (...args: unknown[]) => mockRequestDataErasure(...args),
  cancelDataErasure: (...args: unknown[]) => mockCancelDataErasure(...args),
}));

const STORAGE_KEY = "delego_erasure_request";

describe("useErasureRequest (#610)", () => {
  beforeEach(() => {
    mockRequestDataErasure.mockReset();
    mockCancelDataErasure.mockReset();
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it("starts with no request when nothing is stored", () => {
    const { result } = renderHook(() => useErasureRequest());
    expect(result.current.request).toBeNull();
  });

  it("restores a previously-stored pending request on mount", () => {
    const stored = {
      requestedAt: "2026-01-01T00:00:00.000Z",
      finalizesAt: "2026-01-31T00:00:00.000Z",
      serverTimestamp: "2026-01-01T00:00:00.000Z",
      status: "pending" as const,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useErasureRequest());
    expect(result.current.request).toEqual(stored);
  });

  it("submit() adopts the server-confirmed request and persists it", async () => {
    mockRequestDataErasure.mockResolvedValue({
      data: {
        requestedAt: "2026-01-01T00:00:00.000Z",
        finalizesAt: "2026-01-31T00:00:00.000Z",
        serverTimestamp: "2026-01-01T00:00:00.000Z",
        status: "pending",
      },
      error: null,
    });

    const { result } = renderHook(() => useErasureRequest());
    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.request?.status).toBe("pending");
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}").status).toBe(
      "pending"
    );
  });

  it("submit() leaves the prior state in place on failure and surfaces an error", async () => {
    mockRequestDataErasure.mockResolvedValue({
      data: null,
      error: { code: "server_error", message: "Could not log the request" },
    });

    const { result } = renderHook(() => useErasureRequest());
    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.request).toBeNull();
    expect(result.current.error).toBe("Could not log the request");
  });

  it("cancel() adopts the server-confirmed cancelled state", async () => {
    const stored = {
      requestedAt: "2026-01-01T00:00:00.000Z",
      finalizesAt: "2026-01-31T00:00:00.000Z",
      serverTimestamp: "2026-01-01T00:00:00.000Z",
      status: "pending" as const,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    mockCancelDataErasure.mockResolvedValue({
      data: { ...stored, status: "cancelled" },
      error: null,
    });

    const { result } = renderHook(() => useErasureRequest());
    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.request?.status).toBe("cancelled");
  });

  it("never marks the request cancelled optimistically on a failed cancel", async () => {
    const stored = {
      requestedAt: "2026-01-01T00:00:00.000Z",
      finalizesAt: "2026-01-31T00:00:00.000Z",
      serverTimestamp: "2026-01-01T00:00:00.000Z",
      status: "pending" as const,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    mockCancelDataErasure.mockResolvedValue({
      data: null,
      error: { code: "server_error", message: "Could not cancel" },
    });

    const { result } = renderHook(() => useErasureRequest());
    await act(async () => {
      await result.current.cancel();
    });

    // Still pending — a failed cancel must not flip local state.
    expect(result.current.request?.status).toBe("pending");
    expect(result.current.error).toBe("Could not cancel");
  });
});
