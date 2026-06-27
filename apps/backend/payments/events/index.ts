/**
 * Payment Event Publisher — Issue #205
 *
 * Defines the canonical `PaymentEvent<T>` shape that every route, worker,
 * and settlement path must use when emitting payment lifecycle events.
 *
 * The `publishPaymentEvent` helper serialises the event to a Redis stream
 * (or an in-process fallback in test environments) so that every downstream
 * consumer — analytics, notifications, audit logs — can subscribe from one
 * place.
 */

import { createRequire } from "node:module";
import { createLogger } from "@delego/utils";
import {
  InMemoryProcessedContractEventStore,
  processEscrowContractEvent,
  type EscrowContractEvent,
  type ProcessedContractEventStore,
} from "./dedup-store.js";

const log = createLogger("payments:events", process.env.LOG_LEVEL ?? "info");

// ---------------------------------------------------------------------------
// Legacy narrow event types (kept for backward-compat)
// ---------------------------------------------------------------------------

export type PaymentEventType =
  | "escrow_created"
  | "escrow_released"
  | "escrow_refunded"
  | "settlement_complete";

// ---------------------------------------------------------------------------
// Issue #205 – Generic PaymentEvent<T>
// ---------------------------------------------------------------------------

/**
 * Canonical shape for all payment lifecycle events.
 *
 * @template T – the type of the event-specific `payload`.
 *
 * @property type        – domain event name, e.g. `"escrow_released"`
 * @property orderId     – the order this event belongs to (always required)
 * @property paymentId   – optional payment / transaction identifier
 * @property payload     – event-specific data (strongly typed by `T`)
 * @property occurredAt  – ISO-8601 timestamp of when the event occurred
 */
export interface PaymentEvent<T = unknown> {
  type: string;
  orderId: string;
  paymentId?: string;
  payload: T;
  occurredAt: string;
}

// ---------------------------------------------------------------------------
// Redis stream key
// ---------------------------------------------------------------------------

const STREAM_KEY = "payments:events";

let processedEventStore: ProcessedContractEventStore =
  new InMemoryProcessedContractEventStore();

/** Swap the backing store for a DB-backed implementation in production. */
export function setProcessedContractEventStore(store: ProcessedContractEventStore): void {
  processedEventStore = store;
}

export function resetProcessedContractEventStore(): void {
  processedEventStore = new InMemoryProcessedContractEventStore();
}

// ---------------------------------------------------------------------------
// Internal: lazy Redis client factory
// ---------------------------------------------------------------------------

type RedisLike = {
  xadd(
    key: string,
    id: string,
    ...fieldValues: string[]
  ): Promise<string | null>;
};

let _redis: RedisLike | null = null;

/** Lightweight in-process stub used in test / mock mode. */
function makeInMemoryRedis(): RedisLike {
  const store: Array<{ id: string; fields: Record<string, string> }> = [];
  return {
    async xadd(_key: string, _id: string, ...fieldValues: string[]) {
      const fields: Record<string, string> = {};
      for (let i = 0; i < fieldValues.length; i += 2) {
        fields[fieldValues[i]] = fieldValues[i + 1];
      }
      const id = `${Date.now()}-${store.length}`;
      store.push({ id, fields });
      return id;
    },
  };
}

function getRedisClient(): RedisLike {
  if (_redis) return _redis;

  const isTest = process.env.NODE_ENV === "test";
  const useMock = isTest || process.env.MOCK_REDIS === "true";

  if (useMock) {
    log.info("Using in-memory Redis stub for payment events");
    _redis = makeInMemoryRedis();
  } else {
    // Use createRequire so this ESM module can load CommonJS ioredis safely.
    // ioredis ships a CJS build; a bare `import` from NodeNext ESM would need
    // an explicit `.js` interop shim.  createRequire is the standard solution.
    const _require = createRequire(import.meta.url);
    const { Redis } = _require("ioredis") as typeof import("ioredis");
    _redis = new Redis(
      process.env.REDIS_URL ?? "redis://localhost:6379"
    ) as unknown as RedisLike;
  }

  return _redis!;
}

/** Override the Redis client — useful in tests. */
export function _setRedisClientForTesting(client: RedisLike): void {
  _redis = client;
}

/** Reset the Redis client — call in afterEach to isolate tests. */
export function _resetRedisClient(): void {
  _redis = null;
}

// ---------------------------------------------------------------------------
// publishPaymentEvent
// ---------------------------------------------------------------------------

/**
 * Publish a `PaymentEvent<T>` to the Redis stream `payments:events`.
 *
 * The event is serialised to a single `data` field so that consumers can
 * `JSON.parse` without knowing the individual field layout.
 *
 * On failure the error is logged and re-thrown so callers can decide whether
 * to retry or fall back to a dead-letter queue.
 */
export async function publishPaymentEvent<T = unknown>(
  event: PaymentEvent<T>
): Promise<void> {
  const redis = getRedisClient();
  const serialised = JSON.stringify(event);

  try {
    const id = await redis.xadd(STREAM_KEY, "*", "data", serialised);
    log.info("Payment event published", {
      streamId: id,
      type: event.type,
      orderId: event.orderId,
      paymentId: event.paymentId,
    });
  } catch (err) {
    log.error("Failed to publish payment event", {
      type: event.type,
      orderId: event.orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// emitPaymentEvent (legacy shim — wraps publishPaymentEvent)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `publishPaymentEvent` directly.  This shim exists to keep
 * existing call sites compiling without changes.  It is fire-and-forget and
 * never throws.
 */
export function emitPaymentEvent(event: {
  type: PaymentEventType;
  orderId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}): void {
  publishPaymentEvent<Record<string, unknown>>({
    type: event.type,
    orderId: event.orderId,
    payload: event.payload,
    occurredAt: event.timestamp,
  }).catch((err) =>
    log.error("emitPaymentEvent publish error", {
      error: err instanceof Error ? err.message : String(err),
    })
  );
}

/**
 * Handles on-chain escrow contract events with deduplication.
 * Duplicate blockchain deliveries are skipped after the first successful process.
 *
 * Backed by `processed_contract_events` (see database/migrations/004_processed_contract_events.sql).
 */
export async function handleEscrowContractEvent(
  event: EscrowContractEvent,
  onProcess: (paymentEvent: PaymentEvent<Record<string, unknown>>) => Promise<void> | void
): Promise<boolean> {
  return processEscrowContractEvent(
    event,
    async (contractEvent) => {
      await onProcess({
        type: contractEvent.type,
        orderId: String(contractEvent.payload.orderId ?? ""),
        payload: contractEvent.payload,
        occurredAt: new Date().toISOString(),
      });
    },
    processedEventStore
  );
}

export {
  deriveContractEventId,
  InMemoryProcessedContractEventStore,
  processEscrowContractEvent,
  type EscrowContractEvent,
  type ProcessedContractEventStore,
} from "./dedup-store.js";
