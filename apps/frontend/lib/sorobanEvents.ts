/**
 * Soroban contract event subscription manager.
 *
 * Handles WebSocket reconnection with exponential backoff, XDR topic decoding,
 * and event replay from the last acknowledged ledger sequence to prevent missed events.
 */

import type { NetworkConfig, NetworkId } from "./networks";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ContractEventSubscription {
  contractId: string;
  topics: string[];
  startLedger: number;
  onEvent: (event: SorobanParsedEvent) => void;
  onError: (error: Error) => void;
}

export interface SorobanParsedEvent {
  ledger: number;
  contractId: string;
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface SubscriptionConfig {
  networkId: NetworkId;
  network: NetworkConfig;
  rpcUrl: string;
}

export interface WebSocketReconnectState {
  attemptCount: number;
  maxDelayMs: number;
  isReconnecting: boolean;
  bufferedMessageCount: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = "delego:soroban-event-sequence:";
const BASE_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 15_000;

function getStorageKey(networkId: NetworkId, contractId: string): string {
  return `${STORAGE_PREFIX}${networkId}:${contractId}`;
}

/**
 * Parses the Soroban event XDR topic into a human-readable string.
 *
 * Soroban event topics can contain various XDR types:
 * - Symbol: UTF-8 encoded string
 * - Address: Stellar address (contract or account)
 * - U32: 32-bit unsigned integer
 *
 * This function decodes the topic array into a single string representation.
 */
function decodeXdrTopic(topics: unknown[]): string {
  return topics
    .map((topic) => {
      if (topic === null) return "null";
      if (topic === undefined) return "undefined";
      if (typeof topic === "string") return topic;
      if (typeof topic === "number") return topic.toString();
      if (typeof topic === "bigint") return topic.toString();
      if (typeof topic === "object") {
        // Try to serialize objects
        try {
          return JSON.stringify(topic);
        } catch {
          return String(topic);
        }
      }
      return String(topic);
    })
    .join("::");
}

/**
 * Parses a Soroban event payload, extracting typed values from the raw data.
 *
 * Soroban contract events can contain various XDR scalar types:
 * - bool
 * - i32, u32, i64, u64, i128, u128
 * - symbol (string)
 * - bytes
 * - address (contract/account address)
 * - vec, map, option (complex types)
 */
function parseEventPayload(data: unknown): Record<string, unknown> {
  if (data === null || data === undefined) return {};
  if (typeof data === "string") {
    // Try to parse as JSON first
    try {
      return JSON.parse(data);
    } catch {
      return { value: data };
    }
  }
  if (typeof data === "object") {
    // If it's already an object, assume it's parsed
    return data as Record<string, unknown>;
  }
  return { value: data };
}

/**
 * Encodes a topic filter for the Soroban RPC WebSocket API.
 * Converts symbol topics to their string representation.
 */
function encodeTopicFilter(topics: (string | symbol | number | bigint)[]): unknown[] {
  return topics.map((topic) => {
    if (typeof topic === "symbol") {
      return { type: "symbol", value: topic.description ?? "" };
    }
    if (typeof topic === "bigint") {
      return { type: "u64", value: topic.toString() };
    }
    if (typeof topic === "number") {
      if (Number.isInteger(topic) && topic >= 0 && topic <= 0xffffffff) {
        return { type: "u32", value: topic };
      }
      return { type: "i32", value: topic };
    }
    if (typeof topic === "string") {
      if (topic === "*") return "*";
      return { type: "symbol", value: topic };
    }
    return topic;
  });
}

/**
 * Decodes a topic from the Soroban RPC format back to a string.
 * Handles both raw strings and structured type descriptors.
 */
function decodeRpcTopic(topic: string | { type: string; value: unknown }): string {
  if (typeof topic === "string") return topic;
  if (topic && typeof topic === "object") {
    const { type, value } = topic as { type: string; value: unknown };
    switch (type) {
      case "symbol":
      case "string":
        return String(value);
      case "u32":
      case "u64":
      case "i32":
      case "i64":
        return String(value);
      default:
        return String(value);
    }
  }
  return String(topic);
}

/**
 * Parses a Soroban event from the RPC format.
 */
function parseSorobanEvent(
  rawEvent: {
    ledger: number;
    ledger_close_time: string;
    contract_id: string;
    type: string;
    topic: unknown[];
    data: unknown;
    tx_hash: string;
  },
  networkId: NetworkId
): SorobanParsedEvent {
  const topic = decodeXdrTopic(rawEvent.topic);
  return {
    ledger: rawEvent.ledger,
    contractId: rawEvent.contract_id,
    topic,
    payload: parseEventPayload(rawEvent.data),
    timestamp: rawEvent.ledger_close_time,
  };
}

/**
 * WebSocket URL builder for Soroban contract events.
 */
function buildWebSocketUrl(rpcUrl: string): string {
  const url = new URL(rpcUrl);
  // Convert https/http to wss/ws
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  // Soroban RPC uses the same endpoint for both HTTP RPC and WebSocket
  return url.toString();
}

// ---------------------------------------------------------------------------
// EventSubscriptionManager class
// ---------------------------------------------------------------------------

export class EventSubscriptionManager {
  private subscriptions = new (class extends Map<string, ContractEventSubscription> {
    constructor(private manager: EventSubscriptionManager) {
      super();
    }
    override delete(key: string): boolean {
      const res = super.delete(key);
      if (this.size === 0) {
        this.manager.disconnect();
      }
      return res;
    }
  })(this);
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attemptCount = 0;
  private connected = false;
  private isReconnecting = false;
  private bufferedEvents: SorobanParsedEvent[] = [];
  private lastLedgerSequences = new Map<string, number>();
  private networkId: NetworkId;
  private network: NetworkConfig;
  private rpcUrl: string;
  private cancelled = false;
  private subCounter = 0;

  constructor(config: SubscriptionConfig) {
    this.networkId = config.networkId;
    this.network = config.network;
    this.rpcUrl = config.rpcUrl;
  }

  /**
   * Subscribe to contract events with automatic replay of missed events.
   */
  subscribe(subscription: ContractEventSubscription): () => void {
    const baseKey = this.getSubscriptionKey(subscription.contractId, subscription.topics);
    const key = this.subscriptions.has(baseKey)
      ? `${baseKey}#${++this.subCounter}`
      : baseKey;
    this.subscriptions.set(key, subscription);

    // Update last ledger sequence from storage if available
    const storedLedger = this.loadLastLedgerSequence(subscription.contractId);
    const startLedger = Math.max(storedLedger ?? 0, subscription.startLedger);

    if (!this.socket && !this.reconnectTimer && !this.cancelled) {
      this.connect();
    } else if (this.connected && this.socket?.readyState === (WebSocket.OPEN ?? 1)) {
      this.sendSubscription(subscription, startLedger);
    }

    return () => {
      this.unsubscribe(key);
    };
  }

  /**
   * Unsubscribe from contract events.
   */
  unsubscribe(key: string): void {
    this.subscriptions.delete(key);
    // Check if we still have any active subscriptions
    if (this.subscriptions.size === 0) {
      this.disconnect();
    }
  }

  /**
   * Subscribe to events from multiple contracts with different topic filters.
   */
  subscribeMultiple(
    subscriptions: ContractEventSubscription[]
  ): (() => void)[] {
    return subscriptions.map((s) => this.subscribe(s));
  }

  private parseSorobanEvent(rawEvent: any, networkId?: NetworkId): SorobanParsedEvent {
    return parseSorobanEvent(rawEvent, networkId ?? this.networkId);
  }

  private parseEventPayload(data: unknown): Record<string, unknown> {
    return parseEventPayload(data);
  }

  private encodeTopicFilter(topics: (string | symbol | number | bigint)[]): unknown[] {
    return encodeTopicFilter(topics);
  }

  getReconnectState(): WebSocketReconnectState {
    return {
      attemptCount: this.attemptCount,
      maxDelayMs: MAX_RECONNECT_DELAY_MS,
      isReconnecting: this.isReconnecting,
      bufferedMessageCount: this.bufferedEvents.length,
    };
  }

  /**
   * Get the current connection status.
   */
  isConnected(): boolean {
    return this.connected && this.socket?.readyState === (WebSocket.OPEN ?? 1);
  }

  /**
   * Get the buffered events that were received while disconnected.
   */
  getBufferedEvents(): SorobanParsedEvent[] {
    return [...this.bufferedEvents];
  }

  /**
   * Clear the event buffer.
   */
  clearBufferedEvents(): void {
    this.bufferedEvents = [];
  }

  /**
   * Force reconnection to the Soroban RPC WebSocket.
   */
  reconnect(): void {
    this.attemptCount = 0;
    this.disconnect();
    this.connect();
  }

  /**
   * Disconnect from the WebSocket.
   */
  disconnect(): void {
    this.cancelled = true;
    this.isReconnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
  }

  /**
   * Cleanup: disconnect and clear all subscriptions.
   */
  destroy(): void {
    this.disconnect();
    this.subscriptions.clear();
    this.bufferedEvents = [];
    this.lastLedgerSequences.clear();
    this.attemptCount = 0;
    this.isReconnecting = false;
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  private getSubscriptionKey(contractId: string, topics: string[]): string {
    return `${contractId}:${topics.join("|")}`;
  }

  private loadLastLedgerSequence(contractId: string): number | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(
        getStorageKey(this.networkId, contractId)
      );
      if (!raw) return null;
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) ? null : parsed;
    } catch {
      return null;
    }
  }

  private saveLastLedgerSequence(contractId: string, ledger: number): void {
    const current =
      this.lastLedgerSequences.get(contractId) ??
      this.loadLastLedgerSequence(contractId) ??
      0;
    if (ledger <= current) return;
    this.lastLedgerSequences.set(contractId, ledger);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        getStorageKey(this.networkId, contractId),
        ledger.toString()
      );
    } catch {
      // Storage unavailable - continue anyway
    }
  }

  private connect(): void {
    if (this.cancelled) return;
    if (this.socket && (this.socket.readyState === (WebSocket.CONNECTING ?? 0) || this.socket.readyState === (WebSocket.OPEN ?? 1))) {
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.connected = false;
    this.setupWebSocket();
  }

  private setupWebSocket(): void {
    if (this.cancelled) return;

    try {
      const wsUrl = buildWebSocketUrl(this.rpcUrl);
      this.socket = new WebSocket(wsUrl);
    } catch (err) {
      this.connected = false;
      this.socket = null;
      const error = err instanceof Error ? err : new Error("Failed to open WebSocket");
      this.broadcastError(error);
      this.scheduleReconnect();
      return;
    }

    this.socket.addEventListener("open", () => {
      if (this.cancelled) {
        this.socket?.close();
        return;
      }
      this.attemptCount = 0;
      this.isReconnecting = false;
      this.connected = true;
      this.broadcastStatus(true);

      // Re-subscribe all active subscriptions
      this.subscriptions.forEach((subscription) => {
        const storedLedger = this.loadLastLedgerSequence(subscription.contractId);
        const startLedger = Math.max(
          storedLedger ?? 0,
          subscription.startLedger
        );
        this.sendSubscription(subscription, startLedger);
      });

      // Deliver any buffered events
      this.deliverBufferedEvents();
    });

    this.socket.addEventListener("message", (event) => {
      if (this.cancelled) return;

      try {
        const data = JSON.parse(event.data as string);
        this.handleMessage(data);
      } catch {
        // Ignore malformed messages
      }
    });

    this.socket.addEventListener("close", () => {
      if (this.cancelled) return;
      this.connected = false;
      if (this.socket) {
        this.socket = null;
      }
      this.broadcastStatus(false);
      this.scheduleReconnect();
    });

    this.socket.addEventListener("error", (err) => {
      if (this.cancelled) return;
      this.connected = false;
      if (this.socket) {
        this.socket = null;
      }
      const error = err instanceof Error ? err : new Error("WebSocket error");
      this.broadcastError(error);
      this.scheduleReconnect();
    });
  }

  private sendSubscription(
    subscription: ContractEventSubscription,
    startLedger: number
  ): void {
    if (!this.socket || this.socket.readyState !== (WebSocket.OPEN ?? 1)) return;

    const message = {
      type: "subscribe_contract_events",
      contractAddress: subscription.contractId,
      topics: encodeTopicFilter(subscription.topics),
      ...(startLedger > 0 && { fromLedger: startLedger }),
    };

    try {
      this.socket.send(JSON.stringify(message));
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to send subscription");
      subscription.onError(error);
    }
  }

  private handleMessage(data: unknown): void {
    if (!data || typeof data !== "object") return;

    // Handle status messages
    if (data && typeof data === "object" && "status" in data) {
      const status = (data as { status?: string }).status;
      if (status === "connected") {
        this.connected = true;
        this.broadcastStatus(true);
      }
      return;
    }

    // Handle event messages
    const rawEvent = data as {
      ledger?: number;
      ledger_close_time?: string;
      contract_id?: string;
      type?: string;
      topic?: unknown[];
      data?: unknown;
      tx_hash?: string;
    };

    if (
      rawEvent.ledger !== undefined &&
      rawEvent.contract_id !== undefined &&
      rawEvent.topic !== undefined
    ) {
      const parsed = parseSorobanEvent(
        {
          ledger: rawEvent.ledger,
          ledger_close_time: rawEvent.ledger_close_time ?? new Date().toISOString(),
          contract_id: rawEvent.contract_id,
          type: rawEvent.type ?? "contract",
          topic: rawEvent.topic,
          data: rawEvent.data ?? null,
          tx_hash: rawEvent.tx_hash ?? "",
        },
        this.networkId
      );

      this.handleParsedEvent(parsed);
    }
  }

  private handleParsedEvent(event: SorobanParsedEvent): void {
    // Update last processed ledger
    this.saveLastLedgerSequence(event.contractId, event.ledger);

    // If disconnected, buffer the event
    if (!this.connected) {
      this.bufferedEvents.push(event);
      if (this.bufferedEvents.length > 500) {
        this.bufferedEvents = this.bufferedEvents.slice(-500);
      }
      return;
    }

    // Check if any subscription matches this event
    let matched = false;
    this.subscriptions.forEach((subscription) => {
      if (subscription.contractId === event.contractId) {
        const matchesTopic =
          subscription.topics.length > 0 &&
          subscription.topics.some(
            (topic) =>
              topic === "*" ||
              event.topic === topic ||
              event.topic.split("::").includes(topic) ||
              event.topic.includes(topic)
          );
        if (matchesTopic) {
          matched = true;
          try {
            subscription.onEvent(event);
          } catch (err) {
            subscription.onError(
              err instanceof Error ? err : new Error("Event handler error")
            );
          }
        }
      }
    });

    // Buffer event if not matched (for future subscriptions)
    if (!matched) {
      this.bufferedEvents.push(event);
      if (this.bufferedEvents.length > 500) {
        this.bufferedEvents = this.bufferedEvents.slice(-500);
      }
    }
  }

  private deliverBufferedEvents(): void {
    // Deliver buffered events to active subscriptions
    const eventsToDeliver = [...this.bufferedEvents];
    this.bufferedEvents = [];

    eventsToDeliver.forEach((event) => {
      this.subscriptions.forEach((subscription) => {
        if (subscription.contractId === event.contractId) {
          const matchesTopic =
            subscription.topics.length > 0 &&
            subscription.topics.some(
              (topic) =>
                topic === "*" ||
                event.topic === topic ||
                event.topic.split("::").includes(topic) ||
                event.topic.includes(topic)
            );
          if (matchesTopic) {
            try {
              subscription.onEvent(event);
            } catch (err) {
              subscription.onError(
                err instanceof Error ? err : new Error("Event handler error")
              );
            }
          }
        }
      });
    });
  }

  private broadcastStatus(connected: boolean): void {
    // Status broadcasts are handled by individual subscription callbacks
  }

  private broadcastError(error: Error): void {
    this.subscriptions.forEach((subscription) => {
      try {
        subscription.onError(error);
      } catch {
        // Ignore error handler failures
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.cancelled) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.isReconnecting = true;
    const delay = Math.min(
      MAX_RECONNECT_DELAY_MS,
      BASE_RECONNECT_DELAY_MS * 2 ** this.attemptCount
    );
    this.attemptCount += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.cancelled) {
        this.connect();
      }
    }, delay);
  }
}

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

/**
 * Create a subscription manager for a specific network.
 */
export function createSubscriptionManager(
  config: Omit<SubscriptionConfig, "network">
): EventSubscriptionManager {
  const networkId = config.networkId;
  const network: NetworkConfig = {
    id: networkId,
    label: networkId === "mainnet" ? "Mainnet" : "Testnet",
    shortLabel: networkId === "mainnet" ? "MAIN" : "TEST",
    freighterNetwork: networkId === "mainnet" ? ("PUBLIC" as const) : ("TESTNET" as const),
    networkPassphrase:
      networkId === "mainnet"
        ? "Public Global Stellar Network ; September 2015"
        : "Test SDF Network ; September 2015",
    horizonUrl:
      networkId === "mainnet"
        ? "https://horizon.stellar.org"
        : "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: config.rpcUrl,
    isLive: networkId === "mainnet",
  };
  return new EventSubscriptionManager({ ...config, network });
}

/**
 * Hook for React components to use the event subscription manager.
 */
export function useEventSubscriptionManager(
  config: Omit<SubscriptionConfig, "network">
): EventSubscriptionManager {
  // In a real React hook, we'd use useState/useEffect to manage lifecycle
  // For now, we'll just return a manager instance
  return createSubscriptionManager(config);
}