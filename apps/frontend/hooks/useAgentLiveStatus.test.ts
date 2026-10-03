import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useAgentLiveStatus } from "./useAgentLiveStatus";

/** Minimal stand-in for the browser WebSocket, recording its listeners. */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static shouldThrowOnConstruct = false;

  url: string;
  closed = false;
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(url: string) {
    if (MockWebSocket.shouldThrowOnConstruct) {
      throw new Error("WebSocket unavailable");
    }
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
  }

  emit(type: string, event: unknown = {}) {
    this.listeners.get(type)?.forEach((handler) => handler(event));
  }

  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  MockWebSocket.shouldThrowOnConstruct = false;
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAgentLiveStatus", () => {
  it("returns null and opens no socket while disabled", () => {
    const { result } = renderHook(() => useAgentLiveStatus(false));

    expect(result.current).toBeNull();
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it("derives a wss:// endpoint from the https API url", async () => {
    renderHook(() => useAgentLiveStatus(true));

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    expect(MockWebSocket.instances[0].url).toMatch(/^wss:\/\/.*\/ws\/agent-status$/);
  });

  it("returns null until the first status frame arrives", async () => {
    const { result } = renderHook(() => useAgentLiveStatus(true));

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    expect(result.current).toBeNull();
  });

  it("exposes the parsed status from a message frame", async () => {
    const { result } = renderHook(() => useAgentLiveStatus(true));
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));

    const status = {
      agentId: "agent-1",
      state: "searching" as const,
      currentTaskDescription: "Looking for a laptop",
    };

    await act(async () => {
      MockWebSocket.instances[0].emit("message", {
        data: JSON.stringify(status),
      });
    });

    expect(result.current).toEqual(status);
  });

  it("ignores malformed frames and keeps the last good status", async () => {
    const { result } = renderHook(() => useAgentLiveStatus(true));
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));

    await act(async () => {
      MockWebSocket.instances[0].emit("message", {
        data: JSON.stringify({ agentId: "agent-1", state: "idle" }),
      });
    });

    await act(async () => {
      MockWebSocket.instances[0].emit("message", { data: "not json" });
    });

    expect(result.current).toEqual({ agentId: "agent-1", state: "idle" });
  });

  it("reconnects with backoff when the socket closes", async () => {
    renderHook(() => useAgentLiveStatus(true));
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));

    await act(async () => {
      MockWebSocket.instances[0].emit("close");
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("retries after a failed socket construction", async () => {
    MockWebSocket.shouldThrowOnConstruct = true;
    renderHook(() => useAgentLiveStatus(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it("closes the socket and stops reconnecting on unmount", async () => {
    const { unmount } = renderHook(() => useAgentLiveStatus(true));
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));

    const socket = MockWebSocket.instances[0];
    unmount();

    expect(socket.closed).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(MockWebSocket.instances).toHaveLength(1);
  });
});