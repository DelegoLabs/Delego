import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useContractEvents, type ContractEventFilter } from "./useContractEvents";

// ---------------------------------------------------------------------------
// WebSocket mock
// ---------------------------------------------------------------------------

interface MockSocket {
  url: string;
  listeners: Record<string, Array<(e?: unknown) => void>>;
  sentMessages: string[];
  readyState: number;
  addEventListener: (type: string, cb: (e?: unknown) => void) => void;
  send: (msg: string) => void;
  close: () => void;
  /** Test helper: fire the "open" event */
  open: () => void;
  /** Test helper: fire a "message" event */
  message: (data: unknown) => void;
}

let sockets: MockSocket[] = [];

// WebSocket readyState constants (numeric, since the stubbed constructor won't
// carry the static properties WebSocket.CONNECTING / OPEN / CLOSED).
const WS_CONNECTING = 0;
const WS_CLOSED = 3;

function createMockSocket(url: string): MockSocket {
  const socket: MockSocket = {
    url,
    listeners: {},
    sentMessages: [],
    readyState: WS_CONNECTING,
    addEventListener(type, cb) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(cb);
    },
    send(msg) {
      this.sentMessages.push(msg);
    },
    close() {
      this.readyState = WS_CLOSED;
      this.listeners["close"]?.forEach((cb) => cb());
    },
    open() {
      this.readyState = 1; // WebSocket.OPEN
      this.listeners["open"]?.forEach((cb) => cb());
    },
    message(data) {
      this.listeners["message"]?.forEach((cb) =>
        cb({ data: JSON.stringify(data) })
      );
    },
  };
  sockets.push(socket);
  return socket;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  sockets = [];
  const MockWebSocket = vi.fn().mockImplementation((url: string) => createMockSocket(url));
  // Attach static constants so code under test (and assertions) can use them.
  MockWebSocket.CONNECTING = WS_CONNECTING;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSING = 2;
  MockWebSocket.CLOSED = WS_CLOSED;
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const BASE_FILTER: ContractEventFilter = {
  contractAddress: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  topics: ["transfer"],
};

describe("useContractEvents", () => {
  it("opens exactly one WebSocket connection on initial mount", () => {
    renderHook(() => useContractEvents(BASE_FILTER));
    expect(sockets).toHaveLength(1);
  });

  it("does NOT re-subscribe when parent re-renders with a new inline object having the same values", () => {
    // Simulate a parent that creates a fresh object literal on every render.
    const { rerender } = renderHook(() => {
      // New object reference, same properties — the classic re-render problem.
      return useContractEvents({
        contractAddress: BASE_FILTER.contractAddress,
        topics: ["transfer"],
      });
    });

    // Re-render the parent several times.
    rerender();
    rerender();
    rerender();

    // Despite multiple re-renders with new object literals, still only 1 socket.
    expect(sockets).toHaveLength(1);
  });

  it("tears down the old socket and opens a new one when filter content changes", () => {
    const { rerender } = renderHook(
      ({ filter }: { filter: ContractEventFilter }) =>
        useContractEvents(filter),
      { initialProps: { filter: BASE_FILTER } }
    );

    expect(sockets).toHaveLength(1);
    const firstSocket = sockets[0];

    // Change the filter — contractAddress is different.
    rerender({
      filter: {
        contractAddress: "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB4",
        topics: ["transfer"],
      },
    });

    // The first socket should have been closed.
    expect(firstSocket.readyState).toBe(WebSocket.CLOSED);
    // A brand new socket should have been opened.
    expect(sockets).toHaveLength(2);
  });

  it("closes the socket on unmount", () => {
    const { unmount } = renderHook(() => useContractEvents(BASE_FILTER));
    const socket = sockets[0];
    expect(socket.readyState).toBe(WS_CONNECTING);

    unmount();

    expect(socket.readyState).toBe(WS_CLOSED);
  });

  it("sends a subscription message after the socket opens", () => {
    renderHook(() => useContractEvents(BASE_FILTER));
    const socket = sockets[0];

    act(() => {
      socket.open();
    });

    expect(socket.sentMessages).toHaveLength(1);
    const msg = JSON.parse(socket.sentMessages[0]) as {
      type: string;
      contractAddress: string;
      topics: string[];
    };
    expect(msg.type).toBe("subscribe_contract_events");
    expect(msg.contractAddress).toBe(BASE_FILTER.contractAddress);
    expect(msg.topics).toEqual(["transfer"]);
  });

  it("accumulates received events", () => {
    const { result } = renderHook(() => useContractEvents(BASE_FILTER));
    const socket = sockets[0];

    act(() => {
      socket.open();
    });

    const event1 = {
      contractAddress: BASE_FILTER.contractAddress,
      topics: ["transfer"],
      data: { amount: "100" },
      ledger: 1000,
      ledgerClosedAt: "2026-09-28T00:00:00Z",
      txHash: "abc123",
    };
    const event2 = { ...event1, ledger: 1001, txHash: "def456" };

    act(() => {
      socket.message(event1);
      socket.message(event2);
    });

    expect(result.current.events).toHaveLength(2);
    expect(result.current.events[0].txHash).toBe("abc123");
    expect(result.current.events[1].txHash).toBe("def456");
  });

  it("reports connected=true after socket opens and connected=false after close", () => {
    const { result } = renderHook(() => useContractEvents(BASE_FILTER));
    const socket = sockets[0];

    expect(result.current.connected).toBe(false);

    act(() => {
      socket.open();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      socket.close();
    });
    expect(result.current.connected).toBe(false);
  });

  it("resets accumulated events when the filter changes", () => {
    const { result, rerender } = renderHook(
      ({ filter }: { filter: ContractEventFilter }) =>
        useContractEvents(filter),
      { initialProps: { filter: BASE_FILTER } }
    );

    act(() => {
      sockets[0].open();
      sockets[0].message({
        contractAddress: BASE_FILTER.contractAddress,
        topics: ["transfer"],
        data: {},
        ledger: 999,
        ledgerClosedAt: "2026-09-28T00:00:00Z",
        txHash: "aaa",
      });
    });
    expect(result.current.events).toHaveLength(1);

    // Change the filter — events should be cleared.
    rerender({
      filter: {
        contractAddress: "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB4",
        topics: ["transfer"],
      },
    });

    expect(result.current.events).toHaveLength(0);
  });

  it("handles symbol topics without throwing", () => {
    const symFilter: ContractEventFilter = {
      contractAddress: BASE_FILTER.contractAddress,
      topics: [Symbol("transfer")],
    };
    // Should not throw during render.
    expect(() => renderHook(() => useContractEvents(symFilter))).not.toThrow();
    expect(sockets).toHaveLength(1);
  });

  it("does NOT re-subscribe when re-rendering with a new symbol having the same description", () => {
    const { rerender } = renderHook(() => {
      return useContractEvents({
        contractAddress: BASE_FILTER.contractAddress,
        // New Symbol instance each render, same description.
        topics: [Symbol("transfer")],
      });
    });

    rerender();
    rerender();

    // Symbol topics with the same description → same filter key → 1 socket.
    expect(sockets).toHaveLength(1);
  });
});
