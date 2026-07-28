/**
 * Escrow Event Listener — Issue #56
 *
 * Polls a Soroban RPC for events emitted by the escrow contract and dispatches
 * buyer-facing notifications (email + Web Push) on created, released, refunded,
 * and disputed state transitions.
 *
 * Design mirrors the existing permissionEventListener (#57):
 *  - Polling loop with configurable interval (Soroban has no streaming API).
 *  - A persisted ledger cursor (Redis) lets the listener restart from the last
 *    processed ledger without re-scanning history.
 *  - Per-event deduplication via `${txHash}:${eventIndex}` prevents duplicate
 *    alerts on reconnects or retries.
 *  - Errors are logged-and-skipped: a single bad event never halts the cursor.
 */
import { createLogger } from "@delego/utils";
import { xdr } from "@stellar/stellar-sdk";
import { sendEmail } from "../email/index.js";
import {
  sendPushNotification,
  parseTrackedPushSubscription,
  type PushPayload,
} from "../push/index.js";
import { checkAndMarkDispatched } from "./idempotency.js";
import {
  getWalletLookupAdapter,
  type WalletNotificationTarget,
} from "./walletLookup.js";
import {
  deriveContractEventId,
  InMemoryProcessedContractEventStore,
  type ProcessedContractEventStore,
} from "./dedup-store.js";
import { renderLocalizedTemplate } from "./i18n/localized-template.js";
import { getDbPreferences, type PreferenceDb } from "./preferenceStore.js";

const log = createLogger(
  "notifications:escrowEvents",
  process.env.LOG_LEVEL ?? "info"
);

const DEFAULT_POLL_INTERVAL_MS = 6_000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The four on-chain escrow lifecycle events. */
export type EscrowEventType =
  | "escrow_created"
  | "escrow_released"
  | "escrow_refunded"
  | "escrow_disputed";

/**
 * Normalised, payload-decoded representation of a raw Soroban escrow event.
 * All string fields are human-readable; monetary amounts are in stroops as
 * strings to avoid floating-point imprecision.
 */
export interface EscrowContractEvent {
  contractId: string;
  eventType: EscrowEventType;
  /** Stellar account address of the buyer */
  buyer: string;
  /** Stellar account address of the seller */
  seller: string;
  /** The escrow instance ID (opaque on-chain identifier) */
  escrowId: string;
  /** Amount in stroops (as a string) */
  amountStroops: string;
  /** Transaction hash of the ledger entry */
  txHash: string;
  /** Event index within the transaction (for deduplication) */
  eventIndex: number;
}

export interface RawEscrowRpcEvent {
  id: string;
  ledger: number;
  contractId: string;
  txHash: string;
  topic: { toString(): string }[];
  bodyXdr: string;
}

/** Minimal Redis interface required by the listener. */
export interface EscrowEventRedis {
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  smembers?(key: string): Promise<string[]>;
}

export interface EscrowEventDeps {
  pollIntervalMs?: number;
  startLedger?: number;
  cursorKey?: string;
  dedupStore?: ProcessedContractEventStore;
  walletLookup?: (address: string) => Promise<WalletNotificationTarget | null>;
  sendEmailFn?: typeof sendEmail;
  sendPushFn?: typeof sendPushNotification;
  redis?: EscrowEventRedis;
  /** Optional DB client for reading user notification preferences (#135). */
  db?: PreferenceDb;
  /** User locale resolver — returns BCP-47 locale tag for a userId. */
  getUserLocale?: (userId: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Topic classification
// ---------------------------------------------------------------------------

type EscrowTopicName = "created" | "released" | "refunded" | "disputed";
const ESCROW_PREFIX = "escrow";

const TOPIC_TO_EVENT_TYPE: Readonly<Record<EscrowTopicName, EscrowEventType>> = {
  created: "escrow_created",
  released: "escrow_released",
  refunded: "escrow_refunded",
  disputed: "escrow_disputed",
};

export function mapEscrowTopicToEventType(topicName: string): EscrowEventType | null {
  return TOPIC_TO_EVENT_TYPE[topicName as EscrowTopicName] ?? null;
}

// ---------------------------------------------------------------------------
// Deduplication key
// ---------------------------------------------------------------------------

/**
 * Derives the deduplication key for an escrow event using the same
 * `${txHash}:${eventIndex}` convention as the payments service.
 */
export function deriveEscrowEventId(txHash: string, eventIndex: number): string {
  return deriveContractEventId(txHash, eventIndex);
}

// ---------------------------------------------------------------------------
// Payload decoding
// ---------------------------------------------------------------------------

interface DecodedEscrowBody {
  buyer?: string;
  seller?: string;
  escrow_id?: string;
  amount?: string;
}

function scValToString(scv: xdr.ScVal): string | null {
  const name = scv.switch().name;
  if (name === "scvString" || name === "scvSymbol") {
    try {
      return scv.str().toString();
    } catch {
      try {
        return scv.sym().toString();
      } catch {
        return null;
      }
    }
  }
  if (name === "scvAddress") {
    try {
      const addr = scv.address();
      if (addr.switch().name === "scAddressTypeAccount") {
        const accountId = addr.accountId();
        // Try to get the raw ed25519 bytes and encode as Stellar public key.
        const bytes = tryGetEd25519Bytes(accountId);
        if (bytes) {
          const { Keypair } = require("@stellar/stellar-sdk") as typeof import("@stellar/stellar-sdk");
          return Keypair.fromRawEd25519Seed(Buffer.from(bytes)).publicKey();
        }
      }
    } catch {
      return null;
    }
  }
  if (name === "scvI128" || name === "scvU128" || name === "scvI64" || name === "scvU64") {
    try {
      return BigInt(scv.i128().hi().toString() + scv.i128().lo().toString()).toString();
    } catch {
      try {
        return scv.u64().toString();
      } catch {
        return null;
      }
    }
  }
  return null;
}

function tryGetEd25519Bytes(accountId: xdr.AccountId): Uint8Array | null {
  try {
    const sw = accountId.switch();
    const name = sw.name as string;
    if (name === "publicKeyTypeEd25519" || name === "ed25519") {
      const raw = (accountId as unknown as { ed25519(): Buffer }).ed25519();
      return new Uint8Array(raw);
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Decode a base64-encoded XDR ScVal body from the escrow contract event into
 * a human-readable object.  Returns `null` when the payload is malformed or
 * uses an unrecognised schema.
 */
export function decodeEscrowEventBody(bodyXdr: string): DecodedEscrowBody | null {
  try {
    const scv = xdr.ScVal.fromXDR(bodyXdr, "base64");
    if (scv.switch().name !== "scvMap") return null;
    const map = scv.map();
    if (!map) return null;

    const out: DecodedEscrowBody = {};
    for (const entry of (map as unknown as xdr.ScMapEntry[])) {
      const k = entry.key();
      if (k.switch().name !== "scvSymbol") continue;
      const key = k.sym().toString();
      const val = scValToString(entry.val());
      if (val === null) continue;
      if (key === "buyer") out.buyer = val;
      else if (key === "seller") out.seller = val;
      else if (key === "escrow_id") out.escrow_id = val;
      else if (key === "amount") out.amount = val;
    }
    return out;
  } catch (err) {
    log.warn("Failed to decode escrow event XDR body", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Normalise a raw RPC event into an `EscrowContractEvent`.
 * Returns `null` when the event cannot be classified or decoded.
 */
export function normalizeEscrowEvent(
  raw: RawEscrowRpcEvent
): EscrowContractEvent | null {
  // Topics: [prefix_symbol, event_name_symbol]
  if (raw.topic.length < 2) return null;

  const prefix = raw.topic[0].toString();
  if (prefix !== ESCROW_PREFIX) return null;

  const topicName = raw.topic[1].toString();
  const eventType = mapEscrowTopicToEventType(topicName);
  if (!eventType) return null;

  const idParts = raw.id.split("-");
  const eventIndex = Number(idParts[idParts.length - 1] ?? "0");

  const body = decodeEscrowEventBody(raw.bodyXdr);

  return {
    contractId: raw.contractId,
    eventType,
    buyer: body?.buyer ?? "",
    seller: body?.seller ?? "",
    escrowId: body?.escrow_id ?? raw.id,
    amountStroops: body?.amount ?? "0",
    txHash: raw.txHash,
    eventIndex,
  };
}

// ---------------------------------------------------------------------------
// Notification dispatch helpers
// ---------------------------------------------------------------------------

const DOT_EVENT_MAP: Readonly<Record<EscrowEventType, string>> = {
  escrow_created: "escrow.created",
  escrow_released: "escrow.released",
  escrow_refunded: "escrow.refunded",
  escrow_disputed: "escrow.disputed",
};

async function dispatchEscrowNotification(
  event: EscrowContractEvent,
  deps: Required<
    Pick<
      EscrowEventDeps,
      | "walletLookup"
      | "sendEmailFn"
      | "sendPushFn"
      | "redis"
      | "db"
      | "getUserLocale"
    >
  >
): Promise<void> {
  const target = await deps.walletLookup(event.buyer);
  if (!target) {
    log.info("No user found for buyer address — skipping notification", {
      buyer: event.buyer,
      eventType: event.eventType,
      txHash: event.txHash,
    });
    return;
  }

  // Resolve notification preferences (#135).
  const prefs = await getDbPreferences(deps.db, target.userId);
  const locale = await deps.getUserLocale(target.userId);

  const dotEventType = DOT_EVENT_MAP[event.eventType];
  const interpolationData: Record<string, string> = {
    orderId: event.escrowId,
    amount: event.amountStroops,
    merchant: event.seller,
    buyer: event.buyer,
  };
  const { subject, body } = renderLocalizedTemplate(dotEventType, locale, interpolationData);

  const eventId = deriveEscrowEventId(event.txHash, event.eventIndex);
  const tasks: Promise<void>[] = [];

  // Email channel.
  if (prefs.emailEnabled && target.email) {
    const shouldSend = await checkAndMarkDispatched(
      deps.redis as unknown as Parameters<typeof checkAndMarkDispatched>[0],
      {
        userId: target.userId,
        channel: "email",
        eventType: event.eventType,
        eventId,
      }
    );

    if (shouldSend) {
      tasks.push(
        deps.sendEmailFn({
          to: target.email,
          subject,
          html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
          text: body,
        }).catch((err: unknown) =>
          log.error("Failed to send escrow email notification", {
            error: err instanceof Error ? err.message : String(err),
            userId: target.userId,
            eventType: event.eventType,
          })
        )
      );
    } else {
      log.info("Skipping duplicate escrow email dispatch", {
        userId: target.userId,
        eventId,
      });
    }
  }

  // Push channel.
  if (prefs.pushEnabled && deps.redis.smembers) {
    const pushKey = `push:subscriptions:${target.userId}`;
    const members = await deps.redis.smembers(pushKey);

    for (const member of members) {
      const tracked = parseTrackedPushSubscription(member);

      const shouldSend = await checkAndMarkDispatched(
        deps.redis as unknown as Parameters<typeof checkAndMarkDispatched>[0],
        {
          userId: target.userId,
          channel: "push",
          eventType: event.eventType,
          eventId,
        }
      );

      if (!shouldSend) {
        log.info("Skipping duplicate escrow push dispatch", {
          userId: target.userId,
          eventId,
        });
        continue;
      }

      const payload: PushPayload = {
        title: subject,
        body,
        data: {
          type: event.eventType,
          escrowId: event.escrowId,
          txHash: event.txHash,
        },
      };

      tasks.push(
        deps.sendPushFn(tracked.subscription, payload).catch((err: unknown) =>
          log.error("Failed to send escrow push notification", {
            error: err instanceof Error ? err.message : String(err),
            userId: target.userId,
            eventType: event.eventType,
          })
        )
      );
    }
  }

  await Promise.all(tasks);
}

// ---------------------------------------------------------------------------
// Main listener factory
// ---------------------------------------------------------------------------

/**
 * Starts a polling worker that listens for on-chain escrow contract events and
 * dispatches buyer notifications via email and Web Push.
 *
 * @param rpcUrl     Soroban RPC HTTP endpoint
 * @param contractId The escrow contract ID (Stellar contract address `C...`)
 * @param depsIn     Optional overrides for poll interval, start ledger, cursor
 *                   key, dedup store, and notification delivery functions.
 * @returns          A handle with a `stop()` method for graceful shutdown.
 */
export function startEscrowEventListener(
  rpcUrl: string,
  contractId: string,
  depsIn: EscrowEventDeps = {}
): { stop(): Promise<void> } {
  const { createRequire } = require("node:module") as typeof import("node:module");
  const require_ = createRequire(import.meta.url);
  const { rpc } = require_("@stellar/stellar-sdk") as typeof import("@stellar/stellar-sdk");
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });

  const Redis = (require_("ioredis") as { Redis: typeof import("ioredis").Redis }).Redis;
  const redisDefault = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true });

  const dedupStore: ProcessedContractEventStore =
    depsIn.dedupStore ?? new InMemoryProcessedContractEventStore();
  const redis: EscrowEventRedis =
    depsIn.redis ?? (redisDefault as unknown as EscrowEventRedis);

  const walletLookup =
    depsIn.walletLookup ??
    (() => {
      const adapter = getWalletLookupAdapter();
      return (address: string) => adapter.lookupByWalletAddress(address);
    })();

  const sendEmailFn = depsIn.sendEmailFn ?? sendEmail;
  const sendPushFn = depsIn.sendPushFn ?? sendPushNotification;

  const db: PreferenceDb = depsIn.db ?? {
    // No-op DB that always returns default prefs — overridden in production
    // by injecting a real pg.Pool adapter.
    query: async () => ({ rows: [] }),
  };

  const getUserLocale: (userId: string) => Promise<string> =
    depsIn.getUserLocale ?? (async () => "en");

  const pollIntervalMs =
    depsIn.pollIntervalMs ??
    Number(process.env.ESCROW_EVENT_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS);
  const startLedger =
    depsIn.startLedger ??
    Number(process.env.ESCROW_EVENT_START_LEDGER ?? 0);
  const cursorKey =
    depsIn.cursorKey ??
    `escrow:listener:cursor:${contractId}`;

  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let shuttingDown = false;
  let cursor: number | null = null;
  let initialCursorLoaded = false;

  async function loadCursor(): Promise<number> {
    if (initialCursorLoaded) return cursor ?? startLedger;
    initialCursorLoaded = true;
    try {
      const stored = await redis.get(cursorKey);
      if (stored !== null) {
        cursor = Number(stored);
        return cursor;
      }
    } catch (err) {
      log.warn("Failed to load escrow listener cursor from Redis", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    cursor = startLedger;
    return cursor;
  }

  async function persistCursor(next: number): Promise<void> {
    try {
      await redis.set(cursorKey, String(next), "EX", 60 * 60 * 24 * 30);
      cursor = next;
    } catch (err) {
      log.warn("Failed to persist escrow listener cursor", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function fetchEscrowEvents(fromLedger: number): Promise<RawEscrowRpcEvent[]> {
    try {
      const response = await server.getEvents({
        startLedger: fromLedger,
        filters: [
          {
            type: "contract",
            contractIds: [contractId],
            topics: [[ESCROW_PREFIX]],
          },
        ],
      });
      return (response.events ?? []).map(
        (evt: {
          id: string;
          ledger: number;
          contractId?: { toString(): string };
          topic: { toString(): string }[];
          value: { toXDR(): Buffer };
        }) => ({
          id: evt.id,
          ledger: evt.ledger,
          contractId: evt.contractId ? evt.contractId.toString() : contractId,
          txHash: evt.id,
          topic: evt.topic,
          bodyXdr: evt.value.toXDR().toString("base64"),
        })
      );
    } catch (err) {
      log.error("Failed to fetch escrow events from Soroban RPC", {
        fromLedger,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  async function tick(): Promise<void> {
    if (running || shuttingDown) return;
    running = true;

    try {
      const fromLedger = await loadCursor();
      const rawEvents = await fetchEscrowEvents(fromLedger);

      let maxLedger = fromLedger;
      for (const raw of rawEvents) {
        try {
          const eventId = deriveEscrowEventId(raw.txHash, Number(raw.id.split("-").pop() ?? "0"));

          // Deduplication check.
          if (await dedupStore.has(eventId)) {
            log.debug("Skipping already-processed escrow event", { eventId });
            continue;
          }

          const event = normalizeEscrowEvent(raw);
          if (!event) {
            log.warn("Could not normalise escrow event — skipping", {
              id: raw.id,
              topics: raw.topic.map((t) => t.toString()),
            });
            continue;
          }

          await dispatchEscrowNotification(event, {
            walletLookup,
            sendEmailFn,
            sendPushFn,
            redis,
            db,
            getUserLocale,
          });

          await dedupStore.markProcessed(eventId, contractId);
          if (raw.ledger > maxLedger) maxLedger = raw.ledger;
        } catch (err) {
          log.error("Unhandled error processing escrow event", {
            id: raw.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (maxLedger > fromLedger) {
        await persistCursor(maxLedger + 1);
      }
    } finally {
      running = false;
    }
  }

  function schedule(): void {
    if (shuttingDown) return;
    timer = setTimeout(() => {
      void tick().finally(schedule);
    }, pollIntervalMs);
  }

  log.info("Starting escrow event listener", { rpcUrl, contractId, pollIntervalMs, startLedger });
  schedule();

  return {
    async stop(): Promise<void> {
      shuttingDown = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // Allow the in-flight tick to finish.
      let waited = 0;
      while (running && waited < 5_000) {
        await new Promise((r) => setTimeout(r, 100));
        waited += 100;
      }
      log.info("Escrow event listener stopped");
    },
  };
}
