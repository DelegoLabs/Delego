/**
 * Escrow Event Listener
 *
 * Polls the Soroban RPC `getEvents` endpoint for on-chain escrow contract
 * events, normalises raw payloads into typed `EscrowContractEvent` objects,
 * deduplicates them using Redis (`SET NX EX`), and dispatches unique events to
 * the `notifications:escrow` Redis pub/sub channel — which is automatically
 * forwarded to connected WebSocket clients by `websocket.ts`.
 *
 * Environment variables (see README for details):
 *   SOROBAN_RPC_URL              — Soroban RPC HTTP endpoint
 *   ESCROW_CONTRACT_ID           — Deployed escrow contract Stellar address
 *   ESCROW_EVENT_POLL_INTERVAL_MS — Polling interval in ms (default 5000)
 *   ESCROW_EVENT_DEDUP_TTL_SECONDS — Redis dedup key TTL in seconds (default 86400)
 */

import { Redis } from "ioredis";
import { createLogger } from "@delego/utils";

const log = createLogger("notifications:escrow-listener", process.env.LOG_LEVEL ?? "info");

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type EscrowEventType =
  | "escrow_created"
  | "escrow_released"
  | "escrow_refunded"
  | "escrow_disputed";

export interface EscrowContractEvent {
  contractId: string;
  eventType: EscrowEventType;
  orderId: string;
  buyer: string;
  merchant: string;
  amountStroops: string;
  ledger: number;
  txHash: string;
}

// ---------------------------------------------------------------------------
// Soroban RPC raw event shapes (HTTP JSON-RPC `getEvents` response)
// ---------------------------------------------------------------------------

interface ScValAddress {
  type: "address";
  address: string;
}

interface ScValString {
  type: "string" | "symbol";
  value: string;
}

interface ScValI128 {
  type: "i128" | "u128" | "u64" | "i64";
  low: string;
  high?: string;
}

interface ScValBool {
  type: "bool";
  value: boolean;
}

type ScVal = ScValAddress | ScValString | ScValI128 | ScValBool | { type: string; [key: string]: unknown };

interface RawSorobanEvent {
  type: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  id: string;
  pagingToken: string;
  inSuccessfulContractCall: boolean;
  txHash?: string;
  topic: ScVal[];
  value: ScVal;
}

interface GetEventsResult {
  events: RawSorobanEvent[];
  latestLedger: number;
  cursor?: string;
}

interface SorobanRpcResponse {
  jsonrpc: string;
  id: number;
  result?: GetEventsResult;
  error?: { code: number; message: string };
}

// ---------------------------------------------------------------------------
// Event normalisation
// ---------------------------------------------------------------------------

const KNOWN_EVENT_TYPES = new Set<EscrowEventType>([
  "escrow_created",
  "escrow_released",
  "escrow_refunded",
  "escrow_disputed",
]);

function extractString(val: ScVal | undefined): string {
  if (!val) return "";
  if (val.type === "string" || val.type === "symbol") {
    return (val as ScValString).value ?? "";
  }
  if (val.type === "address") {
    return (val as ScValAddress).address ?? "";
  }
  return "";
}

function extractAmount(val: ScVal | undefined): string {
  if (!val) return "0";
  if (
    val.type === "i128" ||
    val.type === "u128" ||
    val.type === "u64" ||
    val.type === "i64"
  ) {
    // Represent as a plain decimal string from low word (sufficient for u64 amounts)
    return String((val as ScValI128).low ?? "0");
  }
  return "0";
}

/**
 * Normalise a raw Soroban event into an `EscrowContractEvent`.
 *
 * Soroban contract events encode data in `topic` (array of ScVals) and
 * `value` (single ScVal).  The escrow contract emits:
 *   topic[0] = symbol — event type (e.g. "escrow_created")
 *   topic[1] = address — order_id or buyer address depending on event
 *   topic[2] = address — merchant / seller address
 *   value    = map or i128 — amount in stroops (we read from value.low)
 *
 * Returns null if the event cannot be decoded or is not an escrow event.
 */
export function normaliseEvent(raw: RawSorobanEvent): EscrowContractEvent | null {
  try {
    if (!raw.inSuccessfulContractCall) return null;

    const [typeTopic, buyerTopic, merchantTopic] = raw.topic ?? [];
    const eventTypeStr = extractString(typeTopic);

    if (!KNOWN_EVENT_TYPES.has(eventTypeStr as EscrowEventType)) {
      return null;
    }

    const buyer = extractString(buyerTopic);
    const merchant = extractString(merchantTopic);
    const amountStroops = extractAmount(raw.value);

    // orderId may be embedded in the event `id` field (paging token prefix) or
    // as a separate topic. Fallback to event id segment to keep it non-empty.
    const orderId = raw.id?.split("-")[0] ?? raw.pagingToken ?? raw.id ?? "";

    const txHash = raw.txHash ?? raw.id ?? "";

    return {
      contractId: raw.contractId,
      eventType: eventTypeStr as EscrowEventType,
      orderId,
      buyer,
      merchant,
      amountStroops,
      ledger: raw.ledger,
      txHash,
    };
  } catch (err) {
    log.warn("Failed to normalise escrow event", {
      error: err instanceof Error ? err.message : String(err),
      eventId: raw?.id,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deduplication helpers
// ---------------------------------------------------------------------------

const DEDUP_TTL_SECONDS = Number(
  process.env.ESCROW_EVENT_DEDUP_TTL_SECONDS ?? "86400"
);

/**
 * Returns true if this event has NOT been seen before (and marks it as seen).
 * Uses Redis SET NX EX for atomic check-and-set.
 */
export async function markEventIfUnseen(
  redis: Redis,
  txHash: string,
  eventIndex: string
): Promise<boolean> {
  const key = `escrow:seen:${txHash}:${eventIndex}`;
  const result = await redis.set(key, "1", "EX", DEDUP_TTL_SECONDS, "NX");
  return result === "OK";
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const DISPATCH_CHANNEL = "notifications:escrow";

/**
 * Publish a normalised escrow event to the Redis pub/sub channel.
 * The existing `websocket.ts` subscriber picks this up and forwards it
 * to all WebSocket clients subscribed to the `notifications:escrow` topic.
 */
export async function dispatchEscrowEvent(
  event: EscrowContractEvent,
  redisPublisher: Redis
): Promise<void> {
  const payload = JSON.stringify({
    topic: DISPATCH_CHANNEL,
    type: event.eventType,
    payload: event,
    publishedAt: new Date().toISOString(),
  });
  await redisPublisher.publish(DISPATCH_CHANNEL, payload);
  log.info("Dispatched escrow event", {
    eventType: event.eventType,
    txHash: event.txHash,
    ledger: event.ledger,
  });
}

// ---------------------------------------------------------------------------
// Soroban RPC polling
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = Number(
  process.env.ESCROW_EVENT_POLL_INTERVAL_MS ?? "5000"
);
const MAX_BACKOFF_MS = 60_000;
const EVENTS_LIMIT = 100;

async function fetchEvents(
  rpcUrl: string,
  contractId: string,
  startLedger: number
): Promise<GetEventsResult> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "getEvents",
    params: {
      startLedger,
      filters: [
        {
          type: "contract",
          contractIds: [contractId],
        },
      ],
      pagination: { limit: EVENTS_LIMIT },
    },
  });

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!response.ok) {
    throw new Error(
      `Soroban RPC returned HTTP ${response.status}: ${await response.text()}`
    );
  }

  const json = (await response.json()) as SorobanRpcResponse;

  if (json.error) {
    throw new Error(
      `Soroban RPC error ${json.error.code}: ${json.error.message}`
    );
  }

  return json.result ?? { events: [], latestLedger: startLedger };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Start the escrow event listener.
 *
 * Establishes a polling subscription to Soroban RPC `getEvents` for the given
 * contract, decodes and normalises each event, deduplicates by
 * `txHash + eventIndex` using Redis, and dispatches unique events to the
 * `notifications:escrow` Redis pub/sub channel.
 *
 * The function returns immediately; polling runs in the background via
 * `setInterval`-style recursion with exponential back-off on errors.
 *
 * @param rpcUrl     - Soroban RPC HTTP endpoint
 * @param contractId - Escrow contract Stellar address (C…)
 */
export function startEscrowEventListener(
  rpcUrl: string,
  contractId: string
): void {
  if (!rpcUrl) {
    log.warn("SOROBAN_RPC_URL is not set — escrow event listener will not start");
    return;
  }
  if (!contractId) {
    log.warn("ESCROW_CONTRACT_ID is not set — escrow event listener will not start");
    return;
  }

  const redisPublisher = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const redisDedup = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

  redisPublisher.on("error", (err: Error) => {
    log.error("Redis publisher error in escrow listener", { error: err.message });
  });
  redisDedup.on("error", (err: Error) => {
    log.error("Redis dedup error in escrow listener", { error: err.message });
  });

  // Track the highest confirmed ledger we have successfully processed so far.
  // We start from 0 and the RPC will return events from the earliest available.
  let cursorLedger = 0;
  let backoffMs = POLL_INTERVAL_MS;
  let running = false;

  log.info("Starting escrow event listener", {
    rpcUrl,
    contractId,
    pollIntervalMs: POLL_INTERVAL_MS,
    dedupTtlSeconds: DEDUP_TTL_SECONDS,
  });

  async function poll(): Promise<void> {
    if (running) return; // Prevent overlapping polls
    running = true;
    try {
      const result = await fetchEvents(rpcUrl, contractId, cursorLedger);

      for (const rawEvent of result.events) {
        const event = normaliseEvent(rawEvent);
        if (!event) continue;

        // Use the event index within its ledger as a secondary dedup key.
        // `rawEvent.id` is formatted as "<ledger>-<event-index>" by Soroban.
        const eventIndex = rawEvent.id ?? `${rawEvent.ledger}-0`;

        const isNew = await markEventIfUnseen(redisDedup, event.txHash, eventIndex);
        if (!isNew) {
          log.debug("Skipping duplicate escrow event", {
            txHash: event.txHash,
            eventIndex,
          });
          continue;
        }

        await dispatchEscrowEvent(event, redisPublisher);
      }

      // Advance cursor to latest confirmed ledger so next poll only fetches new events.
      if (result.latestLedger > cursorLedger) {
        cursorLedger = result.latestLedger;
      }

      // Reset back-off on success
      backoffMs = POLL_INTERVAL_MS;
    } catch (err) {
      log.error("Escrow event listener poll failed", {
        error: err instanceof Error ? err.message : String(err),
        nextRetryMs: backoffMs,
      });
      // Exponential back-off, capped at MAX_BACKOFF_MS
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    } finally {
      running = false;
      // Schedule next poll
      setTimeout(() => void poll(), backoffMs);
    }
  }

  // Kick off first poll
  void poll();
}
