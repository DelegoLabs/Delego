/**
 * End-to-end integration tests for the EventSubscriptionManager.
 *
 * These tests simulate real-world scenarios including:
 * - Multiple contract subscriptions
 * - Reconnection with event replay
 * - Ledger sequence persistence
 * - Concurrent event delivery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventSubscriptionManager, type ContractEventSubscription, type SorobanParsedEvent } from "./sorobanEvents";

// Mock WebSocket
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

beforeEach(() => {
  vi.stubGlobal("WebSocket", vi.fn().mockImplementation((url: string) => createMockSocket(url)));
  sockets = [];
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe("EventSubscriptionManager - Integration", () => {
  describe("multi-contract subscription scenario", () => {
    it("handles subscriptions to multiple escrow contracts simultaneously", () => {
      const manager = new EventSubscriptionManager({
        networkId: "testnet",
        network: {
          id: "testnet",
          label: "Testnet",
          shortLabel: "TEST",
          freighterNetwork: "TESTNET",
          networkPassphrase: "Test SDF Network ; September 2015",
          horizonUrl: "https://horizon-testnet.stellar.org",
          sorobanRpcUrl: "https://soroban-testnet.stellar.org",
          isLive: false,
        },
        rpcUrl: "https://soroban-testnet.stellar.org",
      });

      const escrow1Events: SorobanParsedEvent[] = [];
      const escrow2Events: SorobanParsedEvent[] = [];
      const errorEvents: Error[] = [];

      // Subscribe to two different escrow contracts
      manager.subscribe({
        contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        topics: ["escrow_created", "funds_released"],
        startLedger: 1,
        onEvent: (event) => {
          escrow1Events.push(event);
        },
        onError: (error) => errorEvents.push(error),
      });

      manager.subscribe({
        contractId: "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB4",
        topics: ["escrow_created", "funds_released"],
        startLedger: 1,
        onEvent: (event) => {
          escrow2Events.push(event);
        },
        onError: (error) => errorEvents.push(error),
      });

      // Connect and send events
      manager["connect"]();
      sockets[0].open();

      // Send events to both contracts
      sockets[0].message({
        ledger: 1000,
        ledger_close_time: "2026-01-15T10:00:00Z",
        contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        type: "contract",
        topic: ["escrow_created"],
        data: { escrowId: "escrow-1" },
        tx_hash: "tx1",
      });

      sockets[0].message({
        ledger: 1001,
        ledger_close_time: "2026-01-15T10:01:00Z",
        contract_id: "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB4",
        type: "contract",
        topic: ["funds_released"],
        data: { escrowId: "escrow-2" },
        tx_hash: "tx2",
      });

      // Both contracts should have received their respective events
      expect(escrow1Events).toHaveLength(1);
      expect(escrow1Events[0].contractId).toBe("CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4");
      expect(escrow2Events).toHaveLength(1);
      expect(escrow2Events[0].contractId).toBe("CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB4");
      expect(escrow1Events[0].topic).toBe("escrow_created");
      expect(escrow2Events[0].topic).toBe("funds_released");
      expect(errorEvents).toHaveLength(0);
    });
  });

  describe("reconnection with missed event replay", () => {
    it("replays missed events when WebSocket reconnects", () => {
      const manager = new EventSubscriptionManager({
        networkId: "testnet",
        network: {
          id: "testnet",
          label: "Testnet",
          shortLabel: "TEST",
          freighterNetwork: "TESTNET",
          networkPassphrase: "Test SDF Network ; September 2015",
          horizonUrl: "https://horizon-testnet.stellar.org",
          sorobanRpcUrl: "https://soroban-testnet.stellar.org",
          isLive: false,
        },
        rpcUrl: "https://soroban-testnet.stellar.org",
      });

      const events: SorobanParsedEvent[] = [];

      manager.subscribe({
        contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        topics: ["*"],
        startLedger: 1,
        onEvent: (event) => {
          events.push(event);
        },
        onError: vi.fn(),
      });

      // Connect, send events, disconnect, reconnect
      manager["connect"]();
      sockets[0].open();

      // Send first batch of events
      sockets[0].message({
        ledger: 1000,
        ledger_close_time: "2026-01-15T10:00:00Z",
        contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        type: "contract",
        topic: ["funds_released"],
        data: { escrowId: "escrow-1", amount: "1000" },
        tx_hash: "tx1",
      });

      // Disconnect and send more events
      sockets[0].close();

      // Send events while disconnected (these will be buffered)
      sockets[0].message({
        ledger: 1001,
        ledger_close_time: "2026-01-15T10:01:00Z",
        contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        type: "contract",
        topic: ["dispute_opened"],
        data: { escrowId: "escrow-1", reason: "item_not_received" },
        tx_hash: "tx2",
      });

      sockets[0].message({
        ledger: 1002,
        ledger_close_time: "2026-01-15T10:02:00Z",
        contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        type: "contract",
        topic: ["funds_released"],
        data: { escrowId: "escrow-1", amount: "2000" },
        tx_hash: "tx3",
      });

      // Verify buffered events
      expect(manager["bufferedEvents"]).toHaveLength(2);

      // Simulate reconnection
      manager["connect"]();
      sockets[1].open();

      // Verify events were delivered
      expect(events).toHaveLength(3);
      expect(events[0].topic).toBe("funds_released");
      expect(events[1].topic).toBe("dispute_opened");
      expect(events[2].topic).toBe("funds_released");

      // Verify ledger sequences were saved
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem("delego:soroban-event-sequence:testnet:CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4");
        expect(stored).toBe("1002");
      }
    });
  });

  describe("high-volume event stream", () => {
    it("handles burst of events without performance degradation", () => {
      const manager = new EventSubscriptionManager({
        networkId: "testnet",
        network: {
          id: "testnet",
          label: "Testnet",
          shortLabel: "TEST",
          freighterNetwork: "TESTNET",
          networkPassphrase: "Test SDF Network ; September 2015",
          horizonUrl: "https://horizon-testnet.stellar.org",
          sorobanRpcUrl: "https://soroban-testnet.stellar.org",
          isLive: false,
        },
        rpcUrl: "https://soroban-testnet.stellar.org",
      });

      const events: SorobanParsedEvent[] = [];
      const startTime = Date.now();

      manager.subscribe({
        contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        topics: ["*"],
        startLedger: 1,
        onEvent: (event) => {
          events.push(event);
        },
        onError: vi.fn(),
      });

      manager["connect"]();
      sockets[0].open();

      // Simulate 100 events in quick succession
      for (let i = 0; i < 100; i++) {
        sockets[0].message({
          ledger: 1000 + i,
          ledger_close_time: "2026-01-15T10:00:00Z",
          contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
          type: "contract",
          topic: ["transfer"],
          data: { amount: (i + 1) * 100, userId: `user-${i}` },
          tx_hash: `tx-${i}`,
        });
      }

      const elapsed = Date.now() - startTime;

      expect(events).toHaveLength(100);
      expect(events[0].ledger).toBe(1000);
      expect(events[99].ledger).toBe(1099);
      expect(elapsed).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe("Ledger sequence persistence across sessions", () => {
    it("persists ledger sequences to localStorage for event replay", () => {
      // First session - process some events
      {
        const manager = new EventSubscriptionManager({
          networkId: "testnet",
          network: {
            id: "testnet",
            label: "Testnet",
            shortLabel: "TEST",
            freighterNetwork: "TESTNET",
            networkPassphrase: "Test SDF Network ; September 2015",
            horizonUrl: "https://horizon-testnet.stellar.org",
            sorobanRpcUrl: "https://soroban-testnet.stellar.org",
            isLive: false,
          },
          rpcUrl: "https://soroban-testnet.stellar.org",
        });

        manager["connect"]();
        sockets[0].open();

        // Process events up to ledger 5000
        for (let i = 0; i < 5; i++) {
          sockets[0].message({
            ledger: 5000 + i,
            ledger_close_time: "2026-01-15T10:00:00Z",
            contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
            type: "contract",
            topic: ["transfer"],
            data: { amount: 100 },
            tx_hash: `tx-${i}`,
          });
        }

        manager.destroy();
      }

      // Second session - should start from ledger 5004
      {
        const subscription = {
          contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
          topics: ["transfer"],
          startLedger: 1, // This should be overridden by stored sequence
          onEvent: vi.fn(),
          onError: vi.fn(),
        };

        const manager = new EventSubscriptionManager({
          networkId: "testnet",
          network: {
            id: "testnet",
            label: "Testnet",
            shortLabel: "TEST",
            freighterNetwork: "TESTNET",
            networkPassphrase: "Test SDF Network ; September 2015",
            horizonUrl: "https://horizon-testnet.stellar.org",
            sorobanRpcUrl: "https://soroban-testnet.stellar.org",
            isLive: false,
          },
          rpcUrl: "https://soroban-testnet.stellar.org",
        });

        manager.subscribe(subscription);
        manager["connect"]();
        const activeSocket = sockets[sockets.length - 1];
        activeSocket.open();

        // Verify the subscription used the stored ledger sequence
        const sentMessage = JSON.parse(activeSocket.sentMessages[0] as string);
        expect(sentMessage.fromLedger).toBe(5004);

        manager.destroy();
      }
    });
  });

  describe("error handling and recovery", () => {
    it("continues processing after individual event handler errors", () => {
      const manager = new EventSubscriptionManager({
        networkId: "testnet",
        network: {
          id: "testnet",
          label: "Testnet",
          shortLabel: "TEST",
          freighterNetwork: "TESTNET",
          networkPassphrase: "Test SDF Network ; September 2015",
          horizonUrl: "https://horizon-testnet.stellar.org",
          sorobanRpcUrl: "https://soroban-testnet.stellar.org",
          isLive: false,
        },
        rpcUrl: "https://soroban-testnet.stellar.org",
      });

      const events1: SorobanParsedEvent[] = [];
      const events2: SorobanParsedEvent[] = [];
      const errors: Error[] = [];

      // First subscription has an error-prone handler
      manager.subscribe({
        contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        topics: ["*"],
        startLedger: 1,
        onEvent: (event) => {
          if (event.ledger === 1001) {
            throw new Error("Simulated handler error");
          }
          events1.push(event);
        },
        onError: (error) => errors.push(error),
      });

      // Second subscription should still receive events
      manager.subscribe({
        contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        topics: ["*"],
        startLedger: 1,
        onEvent: (event) => {
          events2.push(event);
        },
        onError: vi.fn(),
      });

      manager["connect"]();
      sockets[0].open();

      // Send 3 events
      [1000, 1001, 1002].forEach((ledger) => {
        sockets[0].message({
          ledger,
          ledger_close_time: "2026-01-15T10:00:00Z",
          contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
          type: "contract",
          topic: ["transfer"],
          data: { amount: 100 },
          tx_hash: `tx-${ledger}`,
        });
      });

      // First subscription should have received 2 events (1000, 1002) - 1001 caused error
      expect(events1).toHaveLength(2);
      expect(events1[0].ledger).toBe(1000);
      expect(events1[1].ledger).toBe(1002);

      // Error should have been triggered
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe("Simulated handler error");

      // Second subscription should have received all 3 events
      expect(events2).toHaveLength(3);
    });
  });

  describe("topic filtering edge cases", () => {
    it("handles wildcard topic filtering", () => {
      const manager = new EventSubscriptionManager({
        networkId: "testnet",
        network: {
          id: "testnet",
          label: "Testnet",
          shortLabel: "TEST",
          freighterNetwork: "TESTNET",
          networkPassphrase: "Test SDF Network ; September 2015",
          horizonUrl: "https://horizon-testnet.stellar.org",
          sorobanRpcUrl: "https://soroban-testnet.stellar.org",
          isLive: false,
        },
        rpcUrl: "https://soroban-testnet.stellar.org",
      });

      const events: SorobanParsedEvent[] = [];

      manager.subscribe({
        contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        topics: ["*"],
        startLedger: 1,
        onEvent: (event) => {
          events.push(event);
        },
        onError: vi.fn(),
      });

      manager["connect"]();
      sockets[0].open();

      // Send different types of events
      const eventsToSend = [
        { topic: "escrow_created", data: { type: "new" } },
        { topic: "funds_released", data: { type: "release" } },
        { topic: "dispute_opened", data: { type: "dispute" } },
      ];

      eventsToSend.forEach((evt) => {
        sockets[0].message({
          ledger: 1000,
          ledger_close_time: "2026-01-15T10:00:00Z",
          contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
          type: "contract",
          topic: [evt.topic],
          data: evt.data,
          tx_hash: "tx",
        });
      });

      expect(events).toHaveLength(3);
      expect(events[0].topic).toBe("escrow_created");
      expect(events[1].topic).toBe("funds_released");
      expect(events[2].topic).toBe("dispute_opened");
    });

    it("handles empty topic arrays", () => {
      const manager = new EventSubscriptionManager({
        networkId: "testnet",
        network: {
          id: "testnet",
          label: "Testnet",
          shortLabel: "TEST",
          freighterNetwork: "TESTNET",
          networkPassphrase: "Test SDF Network ; September 2015",
          horizonUrl: "https://horizon-testnet.stellar.org",
          sorobanRpcUrl: "https://soroban-testnet.stellar.org",
          isLive: false,
        },
        rpcUrl: "https://soroban-testnet.stellar.org",
      });

      const events: SorobanParsedEvent[] = [];

      manager.subscribe({
        contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        topics: [],
        startLedger: 1,
        onEvent: (event) => {
          events.push(event);
        },
        onError: vi.fn(),
      });

      manager["connect"]();
      sockets[0].open();

      // With empty topics, no events should match
      sockets[0].message({
        ledger: 1000,
        ledger_close_time: "2026-01-15T10:00:00Z",
        contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        type: "contract",
        topic: ["escrow_created"],
        data: { type: "new" },
        tx_hash: "tx",
      });

      expect(events).toHaveLength(0);
    });
  });
});