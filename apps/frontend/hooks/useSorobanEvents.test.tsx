import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { NetworkProvider, useNetwork } from "./useNetwork";
import { useSorobanEvents } from "./useSorobanEvents";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

interface MockSocket {
  url: string;
  listeners: Record<string, Array<(e?: unknown) => void>>;
  sentMessages: unknown[];
  readyState: number;
  addEventListener: (type: string, cb: (e?: unknown) => void) => void;
  send: (msg: unknown) => void;
  close: () => void;
  open: () => void;
  message: (data: unknown) => void;
}

let sockets: MockSocket[] = [];

const WS_CONNECTING = 0;
const WS_OPEN = 1;
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
      this.readyState = WS_OPEN;
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
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  vi.stubGlobal("WebSocket", vi.fn().mockImplementation((url: string) => createMockSocket(url)));
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(),
    setItem: vi.fn(),
    clear: vi.fn(),
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  sockets = [];
  vi.clearAllMocks();
  (localStorage as any).clear.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useSorobanEvents", () => {
  const createSubscription = () => ({
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
    topics: ["test"],
    startLedger: 1,
    onEvent: vi.fn(),
    onError: vi.fn(),
  });

  it("creates an EventSubscriptionManager with network config", () => {
    const { result } = renderHook(
      () => useSorobanEvents(),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <NetworkProvider>
            {children}
          </NetworkProvider>
        ),
      }
    );

    expect(result.current).toBeDefined();
    expect(result.current.isConnected()).toBe(false);
  });

  it("uses custom rpcUrl if provided", () => {
    const customRpcUrl = "https://custom-rpc.example.com";

    const { result } = renderHook(
      () => useSorobanEvents({ rpcUrl: customRpcUrl }),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <NetworkProvider>
            {children}
          </NetworkProvider>
        ),
      }
    );

    // The manager should have been created with the custom RPC URL
    // We can't directly verify this without accessing private members,
    // but we can verify the hook doesn't throw
    expect(result.current).toBeDefined();
  });

  it("connects to WebSocket when subscribing", () => {
    const { result } = renderHook(
      () => useSorobanEvents(),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <NetworkProvider>
            {children}
          </NetworkProvider>
        ),
      }
    );

    result.current.subscribe(createSubscription());

    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toContain("wss://");
  });

  it("disconnects on unmount", () => {
    const { result, unmount } = renderHook(
      () => useSorobanEvents(),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <NetworkProvider>
            {children}
          </NetworkProvider>
        ),
      }
    );

    result.current.subscribe(createSubscription());
    const socket = sockets[0];
    expect(socket.readyState).toBe(WS_CONNECTING);

    unmount();

    expect(socket.readyState).toBe(WS_CLOSED);
  });

  it("reconnects after all subscriptions are removed", () => {
    const { result } = renderHook(
      () => useSorobanEvents(),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <NetworkProvider>
            {children}
          </NetworkProvider>
        ),
      }
    );

    const unsubscribe = result.current.subscribe(createSubscription());
    unsubscribe();
    expect(sockets[0].readyState).toBe(WS_CLOSED);

    result.current.subscribe(createSubscription());
    expect(sockets).toHaveLength(2);
  });

  it("creates new manager when network changes", () => {
    const { result, rerender } = renderHook(
      () => {
        const manager = useSorobanEvents();
        const { networkId, setNetwork } = useNetwork();
        return { manager, networkId, setNetwork };
      },
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <NetworkProvider>
            {children}
          </NetworkProvider>
        ),
      }
    );

    const firstManager = result.current.manager;
    firstManager.subscribe(createSubscription());
    expect(sockets).toHaveLength(1);
    const firstSocket = sockets[0];
    const nextNetwork = result.current.networkId === "mainnet" ? "testnet" : "mainnet";

    act(() => result.current.setNetwork(nextNetwork));
    rerender();

    expect(result.current.manager).not.toBe(firstManager);
    expect(firstSocket.readyState).toBe(WS_CLOSED);

    result.current.manager.subscribe(createSubscription());
    expect(sockets).toHaveLength(2);
  });

  it("allows subscribing to events", () => {
    const onEvent = vi.fn();
    const onError = vi.fn();

    renderHook(
      () => {
        const manager = useSorobanEvents();
        useEffect(() => {
          const unsubscribe = manager.subscribe({
            contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
            topics: ["test"],
            startLedger: 1,
            onEvent,
            onError,
          });
          return unsubscribe;
        }, [manager]);
        return manager;
      },
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <NetworkProvider>
            {children}
          </NetworkProvider>
        ),
      }
    );

    // Simulate WebSocket open and event
    act(() => {
      sockets[0].open();
      sockets[0].message({
        ledger: 1000,
        ledger_close_time: "2026-01-01T00:00:00Z",
        contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        type: "contract",
        topic: ["test"],
        data: { payload: "data" },
        tx_hash: "abc123",
      });
    });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ledger: 1000,
        topic: "test",
        payload: { payload: "data" },
      })
    );
  });

  it("throws when used outside NetworkProvider", () => {
    expect(() => {
      renderHook(() => useSorobanEvents());
    }).toThrow("useNetwork must be used within a NetworkProvider");
  });
});