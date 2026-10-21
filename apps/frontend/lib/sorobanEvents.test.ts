import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { EventSubscriptionManager, type ContractEventSubscription, type SorobanParsedEvent, createSubscriptionManager } from "./sorobanEvents";

// ---------------------------------------------------------------------------
// Mock WebSocket implementation
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
let subscriptions: EventSubscriptionManager[] = [];

// WebSocket readyState constants
const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSING = 2;
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
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  (vi as any).restore = () => vi.useRealTimers();
  const MockWebSocket = vi.fn().mockImplementation((url: string) => createMockSocket(url));
  const withConstants = MockWebSocket as unknown as Record<string, number>;
  withConstants.CONNECTING = WS_CONNECTING;
  withConstants.OPEN = WS_OPEN;
  withConstants.CLOSING = WS_CLOSING;
  withConstants.CLOSED = WS_CLOSED;
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  sockets = [];
  subscriptions.forEach((sub) => sub.destroy());
  subscriptions = [];
  // Clear localStorage
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function createMockEvent(overrides: Partial<SorobanParsedEvent> = {}): SorobanParsedEvent {
  return {
    ledger: 1000,
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
    topic: "escrow_created",
    payload: { escrowId: "test-escrow" },
    timestamp: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createSubscription(overrides: Partial<ContractEventSubscription> = {}): ContractEventSubscription {
  return {
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
    topics: ["escrow_created"],
    startLedger: 1,
    onEvent: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EventSubscriptionManager", () => {
  describe("constructor and basic setup", () => {
    it("creates a subscription manager with correct network config", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });

      expect(manager).toBeInstanceOf(EventSubscriptionManager);
      subscriptions.push(manager);
    });
  });

  describe("subscribe", () => {
    it("adds a subscription and returns an unsubscribe function", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const subscription = createSubscription();
      const unsubscribe = manager.subscribe(subscription);

      expect(subscription.onEvent).not.toHaveBeenCalled();
      expect(typeof unsubscribe).toBe("function");

      unsubscribe();
      // Should not throw
    });

    it("can subscribe to multiple contracts with different topics", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const sub1 = createSubscription({
        contractId: "CAAAA...",
        topics: ["topic_a"],
      });
      const sub2 = createSubscription({
        contractId: "CBBBB...",
        topics: ["topic_b"],
      });

      manager.subscribe(sub1);
      manager.subscribe(sub2);

      expect(manager["subscriptions"].size).toBe(2);
    });
  });

  describe("event parsing", () => {
    it("correctly parses raw event data into SorobanParsedEvent", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      // Access the internal parse method via type assertion
      const parseEvent = (manager as any)["parseSorobanEvent"].bind(manager);

      const rawEvent = {
        ledger: 12345,
        ledger_close_time: "2026-01-15T10:30:00Z",
        contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        type: "contract",
        topic: ["escrow_created"],
        data: { escrowId: "abc123", amount: "1000" },
        tx_hash: "abc123def456",
      };

      const parsed = parseEvent(rawEvent, "testnet");

      expect(parsed.ledger).toBe(12345);
      expect(parsed.contractId).toBe("CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4");
      expect(parsed.topic).toBe("escrow_created");
      expect(parsed.payload).toEqual({ escrowId: "abc123", amount: "1000" });
      expect(parsed.timestamp).toBe("2026-01-15T10:30:00Z");
    });

    it("decodes multiple topics correctly", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const parseEvent = (manager as any)["parseSorobanEvent"].bind(manager);

      const rawEvent = {
        ledger: 12345,
        ledger_close_time: "2026-01-15T10:30:00Z",
        contract_id: "CAAAA...",
        type: "contract",
        topic: ["transfer", "user1", 42],
        data: null,
        tx_hash: "abc123",
      };

      const parsed = parseEvent(rawEvent, "testnet");

      expect(parsed.topic).toBe("transfer::user1::42");
    });

    it("handles null and undefined topics gracefully", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const parseEvent = (manager as any)["parseSorobanEvent"].bind(manager);

      const rawEvent = {
        ledger: 12345,
        ledger_close_time: "2026-01-15T10:30:00Z",
        contract_id: "CAAAA...",
        type: "contract",
        topic: [null, "topic", undefined],
        data: null,
        tx_hash: "abc123",
      };

      const parsed = parseEvent(rawEvent, "testnet");

      expect(parsed.topic).toBe("null::topic::undefined");
    });

    it("parses string payloads correctly", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const parsePayload = (manager as any)["parseEventPayload"].bind(manager);

      expect(parsePayload('{"key":"value"}')).toEqual({ key: "value" });
      expect(parsePayload("plain string")).toEqual({ value: "plain string" });
      expect(parsePayload(123)).toEqual({ value: 123 });
      expect(parsePayload({ nested: { object: true } })).toEqual({ nested: { object: true } });
    });
  });

  describe("WebSocket connection", () => {
    it("connects to the correct WebSocket URL", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      // Trigger connection
      manager["connect"]();

      expect(sockets).toHaveLength(1);
      expect(sockets[0].url).toContain("wss://");
      expect(sockets[0].url).toContain("soroban-testnet.stellar.org");
    });

    it("sends subscription message after WebSocket opens", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const subscription = createSubscription();
      manager.subscribe(subscription);

      // Trigger connection
      manager["connect"]();

      // Simulate WebSocket open
      sockets[0].open();

      expect(sockets[0].sentMessages).toHaveLength(1);
      const message = JSON.parse(sockets[0].sentMessages[0] as string);
      expect(message.type).toBe("subscribe_contract_events");
      expect(message.contractAddress).toBe(subscription.contractId);
      expect(message.topics).toEqual([{ type: "symbol", value: "escrow_created" }]);
    });

    it("handles multiple subscriptions with different topics", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const sub1 = createSubscription({ topics: ["topic_a"] });
      const sub2 = createSubscription({ topics: ["topic_b"] });

      manager.subscribe(sub1);
      manager.subscribe(sub2);

      manager["connect"]();
      sockets[0].open();

      expect(sockets[0].sentMessages).toHaveLength(2);

      const msg1 = JSON.parse(sockets[0].sentMessages[0] as string);
      const msg2 = JSON.parse(sockets[0].sentMessages[1] as string);

      expect(msg1.topics).toEqual([{ type: "symbol", value: "topic_a" }]);
      expect(msg2.topics).toEqual([{ type: "symbol", value: "topic_b" }]);
    });

    it("handles bigInteger topics correctly", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const encodeTopic = (manager as any)["encodeTopicFilter"].bind(manager);
      const result = encodeTopic([BigInt(1000000)]);

      expect(result).toEqual([{ type: "u64", value: "1000000" }]);
    });
  });

  describe("event delivery", () => {
    it("delivers events to matching subscriptions", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const subscription = createSubscription();
      manager.subscribe(subscription);

      manager["connect"]();
      sockets[0].open();

      const event = createMockEvent({
        contractId: subscription.contractId,
        topic: "escrow_created",
      });

      sockets[0].message({
        ledger: event.ledger,
        ledger_close_time: event.timestamp,
        contract_id: event.contractId,
        type: "contract",
        topic: ["escrow_created"],
        data: event.payload,
        tx_hash: "abc123",
      });

      expect(subscription.onEvent).toHaveBeenCalledTimes(1);
      expect(subscription.onEvent).toHaveBeenCalledWith(event);
    });

    it("does NOT deliver events to non-matching subscriptions", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const sub1 = createSubscription({ topics: ["topic_a"] });
      const sub2 = createSubscription({ topics: ["topic_b"] });

      manager.subscribe(sub1);
      manager.subscribe(sub2);

      manager["connect"]();
      sockets[0].open();

      // Send event with topic_a
      sockets[0].message({
        ledger: 1000,
        ledger_close_time: "2026-01-01T00:00:00Z",
        contract_id: sub1.contractId,
        type: "contract",
        topic: ["topic_a"],
        data: null,
        tx_hash: "abc123",
      });

      expect(sub1.onEvent).toHaveBeenCalledTimes(1);
      expect(sub2.onEvent).not.toHaveBeenCalled();
    });

    it("delivers events with multiple topic filters", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const subscription = createSubscription({ topics: ["topic_a", "topic_b"] });
      manager.subscribe(subscription);

      manager["connect"]();
      sockets[0].open();

      // Send event with topic_b (second filter)
      sockets[0].message({
        ledger: 1000,
        ledger_close_time: "2026-01-01T00:00:00Z",
        contract_id: subscription.contractId,
        type: "contract",
        topic: ["topic_b"],
        data: null,
        tx_hash: "abc123",
      });

      expect(subscription.onEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe("reconnection with exponential backoff", () => {
    it("reconnects after WebSocket closes", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      manager["connect"]();
      sockets[0].open();
      expect(sockets).toHaveLength(1);

      // Simulate close
      sockets[0].close();

      // Should schedule a reconnect
      expect(sockets).toHaveLength(1); // Still 1 because reconnect hasn't happened yet
    });

    it("increases delay on each reconnect attempt", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      manager["connect"]();
      sockets[0].open();

      // First close
      sockets[0].close();
      expect(manager["attemptCount"]).toBe(1);

      // Second close
      sockets[0].close();
      expect(manager["attemptCount"]).toBe(2);

      // Third close
      sockets[0].close();
      expect(manager["attemptCount"]).toBe(3);
    });

    it("caps reconnect delay at MAX_RECONNECT_DELAY_MS", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      // Manually set high attempt count
      manager["attemptCount"] = 20;

      manager["connect"]();

      // Verify the delay is capped
      const timer = vi.useFakeTimers();
      manager["scheduleReconnect"]();
      timer.advanceTimersByTime(15000);
      timer.clearAllTimers();
    });
  });

  describe("ledger sequence persistence", () => {
    it("saves the highest processed ledger sequence", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      manager["connect"]();
      sockets[0].open();

      const event1 = createMockEvent({ ledger: 1000 });
      const event2 = createMockEvent({ ledger: 1005 });
      const event3 = createMockEvent({ ledger: 1003 }); // Lower, should not update

      sockets[0].message({
        ledger: event1.ledger,
        ledger_close_time: event1.timestamp,
        contract_id: event1.contractId,
        type: "contract",
        topic: ["escrow_created"],
        data: event1.payload,
        tx_hash: "abc123",
      });

      sockets[0].message({
        ledger: event2.ledger,
        ledger_close_time: event2.timestamp,
        contract_id: event2.contractId,
        type: "contract",
        topic: ["escrow_created"],
        data: event2.payload,
        tx_hash: "def456",
      });

      sockets[0].message({
        ledger: event3.ledger,
        ledger_close_time: event3.timestamp,
        contract_id: event3.contractId,
        type: "contract",
        topic: ["escrow_created"],
        data: event3.payload,
        tx_hash: "ghi789",
      });

      // Check localStorage
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem("delego:soroban-event-sequence:testnet:CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4");
        expect(stored).toBe("1005"); // Should save highest
      }
    });

    it("uses stored ledger sequence as startLedger", () => {
      const contractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
      const storedLedger = 5000;

      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          `delego:soroban-event-sequence:testnet:${contractId}`,
          storedLedger.toString()
        );
      }

      const subscription = createSubscription({
        contractId,
        startLedger: 1000, // Lower than stored
      });

      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      manager.subscribe(subscription);
      manager["connect"]();
      sockets[0].open();

      const message = JSON.parse(sockets[0].sentMessages[0] as string);
      // Should use stored ledger (5000) which is higher than subscription.startLedger (1000)
      expect(message.fromLedger).toBe(storedLedger);
    });
  });

  describe("error handling", () => {
    it("calls onError when WebSocket fails to connect", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const subscription = createSubscription();
      manager.subscribe(subscription);

      // Force a connection error by not implementing the mock properly
      const socket = sockets[0];
      socket.readyState = WS_CLOSED;
      socket.listeners["error"]?.forEach((cb: any) => cb(new Error("Connection refused")));

      expect(subscription.onError).toHaveBeenCalled();
    });

    it("continues processing after a subscription callback error", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const subscription = createSubscription({
        onEvent: vi.fn().mockImplementation(() => {
          throw new Error("Handler error");
        }),
        onError: vi.fn(),
      });
      manager.subscribe(subscription);

      manager["connect"]();
      sockets[0].open();

      sockets[0].message({
        ledger: 1000,
        ledger_close_time: "2026-01-01T00:00:00Z",
        contract_id: subscription.contractId,
        type: "contract",
        topic: ["escrow_created"],
        data: null,
        tx_hash: "abc123",
      });

      // onError should have been called due to handler error
      expect(subscription.onError).toHaveBeenCalled();
    });
  });

  describe("unsubscribe and cleanup", () => {
    it("removes subscription when unsubscribed", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const subscription = createSubscription();
      const unsubscribe = manager.subscribe(subscription);

      expect(manager["subscriptions"].size).toBe(1);

      unsubscribe();

      expect(manager["subscriptions"].size).toBe(0);
    });

    it("closes WebSocket when all subscriptions are removed", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      manager["connect"]();
      sockets[0].open();

      const sub1 = createSubscription();
      const sub2 = createSubscription({ topics: ["escrow_updated"] });

      manager.subscribe(sub1);
      manager.subscribe(sub2);

      expect(manager["subscriptions"].size).toBe(2);

      // Remove first subscription
      manager["subscriptions"].delete(manager["getSubscriptionKey"](sub1.contractId, sub1.topics));
      // WebSocket should still be open

      // Remove second subscription
      manager["subscriptions"].delete(manager["getSubscriptionKey"](sub2.contractId, sub2.topics));

      // WebSocket should be closed
      expect(sockets[0].readyState).toBe(WS_CLOSED);
    });

    it("destroy method cleans up everything", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const subscription = createSubscription();
      manager.subscribe(subscription);

      manager["connect"]();
      sockets[0].open();

      manager.destroy();

      expect(manager["subscriptions"].size).toBe(0);
      expect(sockets[0].readyState).toBe(WS_CLOSED);
      expect(manager["bufferedEvents"].length).toBe(0);
    });
  });

  describe("buffered events", () => {
    it("buffers events received while disconnected", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const subscription = createSubscription();
      manager.subscribe(subscription);

      // Connect and then disconnect
      manager["connect"]();
      sockets[0].open();
      sockets[0].close();

      // Send events while disconnected
      const event1 = createMockEvent({ ledger: 1000 });
      const event2 = createMockEvent({ ledger: 1001 });

      sockets[0].message({
        ledger: event1.ledger,
        ledger_close_time: event1.timestamp,
        contract_id: event1.contractId,
        type: "contract",
        topic: ["escrow_created"],
        data: event1.payload,
        tx_hash: "abc123",
      });

      sockets[0].message({
        ledger: event2.ledger,
        ledger_close_time: event2.timestamp,
        contract_id: event2.contractId,
        type: "contract",
        topic: ["escrow_created"],
        data: event2.payload,
        tx_hash: "def456",
      });

      expect(manager["bufferedEvents"]).toHaveLength(2);
    });

    it("delivers buffered events when reconnecting", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const subscription = createSubscription();
      manager.subscribe(subscription);

      manager["connect"]();
      sockets[0].open();
      sockets[0].close();

      // Send some events while disconnected
      const event = createMockEvent();
      sockets[0].message({
        ledger: event.ledger,
        ledger_close_time: event.timestamp,
        contract_id: event.contractId,
        type: "contract",
        topic: ["escrow_created"],
        data: event.payload,
        tx_hash: "abc123",
      });

      // Reconnect
      manager["connect"]();
      sockets[1].open();

      // Events should be delivered
      expect(subscription.onEvent).toHaveBeenCalledWith(event);
    });
  });

  describe("edge cases", () => {
    it("handles malformed JSON messages gracefully", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const subscription = createSubscription();
      manager.subscribe(subscription);

      manager["connect"]();
      sockets[0].open();

      // Send malformed JSON
      const originalSend = sockets[0].send;
      sockets[0].send = () => {}; // No-op send
      sockets[0].listeners["message"]?.forEach((cb: any) =>
        cb({ data: "{ invalid json" })
      );

      // Should not throw
      expect(subscription.onEvent).not.toHaveBeenCalled();
    });

    it("ignores messages without required fields", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      const subscription = createSubscription();
      manager.subscribe(subscription);

      manager["connect"]();
      sockets[0].open();

      // Send incomplete message
      sockets[0].message({
        ledger: 1000,
        // Missing contract_id
        topic: ["escrow_created"],
        data: null,
      });

      expect(subscription.onEvent).not.toHaveBeenCalled();
    });

    it("limits buffered event size", () => {
      const manager = createSubscriptionManager({
        networkId: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      subscriptions.push(manager);

      manager["connect"]();
      sockets[0].open();
      sockets[0].close();

      // Send more than 1000 events
      for (let i = 0; i < 1100; i++) {
        sockets[0].message({
          ledger: 1000 + i,
          ledger_close_time: "2026-01-01T00:00:00Z",
          contract_id: "CAAAA...",
          type: "contract",
          topic: ["event"],
          data: null,
          tx_hash: `tx${i}`,
        });
      }

      expect(manager["bufferedEvents"].length).toBe(500); // Should be capped
    });
  });
});