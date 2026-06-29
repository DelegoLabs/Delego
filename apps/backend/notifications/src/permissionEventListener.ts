/**
 * Permission Event Listener — Issue #57
 *
 * Polls a Soroban RPC for events emitted by the permissions contract and
 * dispatches owner-facing security alerts (email + Web Push) on grants,
 * updates, and revocations.
 *
 * Design:
 *  - Polling drives the loop (Soroban has no streamed events API).
 *  - A persisted startLedger cursor (Redis) lets the listener restart from
 *    the last processed ledger without scanning history.
 *  - Per-event deduplication is achieved with `deriveContractEventId(txHash,
 *    eventIndex)` style keying so duplicate blockchain deliveries never
 *    trigger duplicate notifications.
 *  - Dispatch uses the existing `checkAndMarkDispatched` 24h NX idempotency
 *    key so retries, schedulers, and worker restarts are safe.
 *  - Errors are logged-and-skipped: a single bad event never crashes the
 *    loop or stops the cursor from advancing.
 */
import { createRequire } from "node:module";
import { createLogger } from "@delego/utils";
import { xdr } from "@stellar/stellar-sdk";
import { sendEmail } from "../email/index.js";
import {
  sendPushNotification,
  type PushPayload,
  type PushSubscription,
} from "../push/index.js";
import { checkAndMarkDispatched } from "./idempotency.js";
import {
  getWalletLookupAdapter,
  type WalletNotificationTarget,
} from "./walletLookup.js";
import {
  InMemoryProcessedContractEventStore,
  type ProcessedContractEventStore,
} from "./dedup-store.js";

const log = createLogger(
  "notifications:permissionEvents",
  process.env.LOG_LEVEL ?? "info"
);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PermissionContractEvent {
  contractId: string;
  eventType: "permission_granted" | "permission_updated" | "permission_revoked";
  owner: string;
  delegate: string;
  limitStroops?: string;
  expiresAtLedger?: number;
  txHash: string;
}

export interface RawRpcEvent {
  id: string;
  ledger: number;
  transactionIndex?: number;
  operationIndex?: number;
  contractId: string;
  txHash: string;
  topic: { toString(): string }[];
  bodyXdr: string;
}

export interface PermissionEventRedis {
  set(
    key: string,
    value: string,
    ...args: Array<string | number>
  ): Promise<unknown>;
  get(key: string): Promise<string | null>;
  smembers?(key: string): Promise<string[]>;
}

export interface PermissionEventDeps {
  pollIntervalMs?: number;
  startLedger?: number;
  cursorKey?: string;
  dedupStore?: ProcessedContractEventStore;
  walletLookup?: (address: string) => Promise<WalletNotificationTarget | null>;
  sendEmailFn?: typeof sendEmail;
  sendPushFn?: typeof sendPushNotification;
  redis?: PermissionEventRedis;
}

// ---------------------------------------------------------------------------
// Topic -> event type classification
// ---------------------------------------------------------------------------

type PermissionTopicName =
  | "granted"
  | "revoked"
  | "spent"
  | "paused"
  | "resumed"
  | "allowdec"
  | "gpaused";

const PERM_PREFIX = "perm";

export function mapTopicToEventType(
  topicName: PermissionTopicName
): PermissionContractEvent["eventType"] | null {
  switch (topicName) {
    case "granted":
      return "permission_granted";
    case "revoked":
      return "permission_revoked";
    case "spent":
    case "paused":
    case "resumed":
    case "allowdec":
    case "gpaused":
      return "permission_updated";
    default:
      return null;
  }
}

const KNOWN_TOPIC_NAMES: ReadonlySet<PermissionTopicName> = new Set([
  "granted",
  "revoked",
  "spent",
  "paused",
  "resumed",
  "allowdec",
  "gpaused",
]);

function isPermissionTopicName(name: string): name is PermissionTopicName {
  return KNOWN_TOPIC_NAMES.has(name as PermissionTopicName);
}

// ---------------------------------------------------------------------------
// Idempotency key derivation
// ---------------------------------------------------------------------------

/**
 * Derive a per-event idempotency key from the SDK `EventResponse.id`
 * composite (format: `{ledger}-{txIdx}-{opIdx}-{eventIdx}`). The composite
 * is guaranteed unique per event by the RPC node.
 */
export function deriveEventIdempotencyKey(raw: RawRpcEvent): string | null {
  const parts = raw.id.split("-");
  if (parts.length < 2) return null;
  const eventIdx = Number(parts[parts.length - 1]);
  if (!Number.isFinite(eventIdx) || eventIdx < 0) return null;
  const txKey = parts.slice(0, -1).join(":");
  if (!txKey) return null;
  return `${txKey}:${eventIdx}`;
}

// ---------------------------------------------------------------------------
// XDR decoding helpers
// ---------------------------------------------------------------------------

/**
 * Minimal structural type covering the parts of `xdr.ScMap` we actually
 * use.  The Stellar SDK exports `ScMap` as an XDR array whose exact
 * declared type is shaped like `XDRArray<ScMapEntry>`; using that class
 * directly here would drag in the full union of array helpers across the
 * codebase.  We only need indexed access and `.key()` / `.val()` on each
 * map entry, so a structural shape is sufficient and side-steps the
 * `abstract new` constraint.
 */
type ScMapLike = {
  length: number;
  get(i: number): xdr.ScMapEntry;
};

function decodeMap(map: ScMapLike): Record<string, xdr.ScVal> {
  const out: Record<string, xdr.ScVal> = {};
  for (let i = 0; i < map.length; i++) {
    const entry = map.get(i);
    const k = entry.key();
    if (k.switch().name === "scvSymbol") {
      out[k.sym().toString()] = entry.val();
    }
  }
  return out;
}

interface DecodedPermissionBody {
  owner?: xdr.ScVal;
  delegate?: xdr.ScVal;
  per_tx_limit?: xdr.ScVal;
  total_limit?: xdr.ScVal;
  new_limit?: xdr.ScVal;
  old_limit?: xdr.ScVal;
  expires_at_ledger?: xdr.ScVal;
}

function decodeBody(bodyXdr: string): DecodedPermissionBody | null {
  const scv = xdr.ScVal.fromXDR(bodyXdr, "base64");
  if (scv.switch().name !== "scvMap") return null;
  const map = scv.map();
  if (!map) return null;
  const decoded = decodeMap(map as unknown as ScMapLike);
  const allowedKeys = [
    "owner",
    "delegate",
    "per_tx_limit",
    "total_limit",
    "new_limit",
    "old_limit",
    "expires_at_ledger",
  ] as const;
  const out: DecodedPermissionBody = {};
  for (const key of allowedKeys) {
    const v = decoded[key];
    if (v) out[key] = v;
  }
  return out;
}

/**
 * Extract a Stellar account address (`G...`) from an `ScVal`.  Returns
 * `null` for non-account addresses (contract `C...`, muxed, etc) so the
 * caller can skip rather than leak raw XDR to end users.
 *
 * The Stellar SDK exposes `AccountId` as a tagged union over `ed25519`
 * and `muxedAccount` variants; the exact accessor and switch-name vary
 * across SDK builds.  We try the high-level accessors first, then fall
 * back to parsing the AccountId XDR bytes directly so the listener keeps
 * working across SDK versions.
 */
function scValToStellarAddress(scv: xdr.ScVal): string | null {
  if (scv.switch().name !== "scvAddress") return null;
  const addr = scv.address();
  if (addr.switch().name !== "scAddressTypeAccount") return null;
  const accountId = addr.accountId();
  let bytes: Uint8Array | null = null;

  // 1. Try high-level accessors through a discriminated `switch()` lookup.
  try {
    const sw = accountId.switch();
    const candidates: ReadonlyArray<string> = [
      "publicKeyTypeEd25519",
      "ed25519",
    ];
    if (candidates.includes(sw.name)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acc: any = (accountId as any).ed25519?.();
      if (acc instanceof Uint8Array) {
        bytes = acc;
      } else if (typeof acc === "string") {
        bytes = Buffer.from(acc, "hex");
      }
    }
  } catch {
    bytes = null;
  }

  // 2. Last-resort: parse the raw AccountId XDR for the 32-byte payload.
  //    The canonical encoding of an ed25519 AccountId is a 4-byte union
  //    discriminator (0x00000000 == ed25519) followed by 32 raw bytes of
  //    public key. Skip the discriminator and read the next 32 bytes so
  //    we work across SDK builds without depending on switch().name.
  if (!bytes) {
    try {
      const raw = accountId.toXDR();
      // raw is a Buffer/ArrayBuffer/Uint8Array depending on SDK build.
      const buf =
        raw instanceof Uint8Array
          ? raw
          : (raw as { buffer?: ArrayBuffer }).buffer
            ? new Uint8Array((raw as { buffer: ArrayBuffer }).buffer)
            : new Uint8Array(raw as ArrayLike<number>);
      // Skip 4-byte Union discriminator, take 32 bytes ed25519 key.
      if (buf.length >= 4 + 32) {
        bytes = buf.slice(4, 4 + 32);
      }
    } catch {
      return null;
    }
  }

  if (!bytes || bytes.length !== 32) return null;
  return encodeEd25519PublicKey(bytes);
}

function encodeEd25519PublicKey(bytes: Uint8Array): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { StrKey } = require("@stellar/stellar-sdk") as typeof import("@stellar/stellar-sdk");
    return StrKey.encodeEd25519PublicKey(Buffer.from(bytes));
  } catch {
    return null;
  }
}

function scValToBigIntString(scv: xdr.ScVal): string | null {
  const name = scv.switch().name;
  try {
    if (name === "scvI128") {
      const parts = scv.i128();
      const lo = parts.lo();
      const hi = parts.hi();
      const hiBig = BigInt(Number(hi));
      const loBig = BigInt(Number(lo));
      return (hiBig * BigInt("18446744073709551616") + loBig).toString();
    }
    if (name === "scvU64") return BigInt(String(scv.u64())).toString();
    if (name === "scvI64") return BigInt(String(scv.i64())).toString();
    if (name === "scvU32") return BigInt(scv.u32()).toString();
    if (name === "scvI32") return BigInt(scv.i32()).toString();
    return null;
  } catch {
    return null;
  }
}

function scValToU32OrNull(scv: xdr.ScVal | undefined): number | undefined {
  if (!scv) return undefined;
  const name = scv.switch().name;
  if (name === "scvU32") return scv.u32();
  if (name === "scvI32") return scv.i32();
  return undefined;
}

/**
 * Pure helper exposed for tests.  Transforms a raw RPC event into the
 * higher-level {@link PermissionContractEvent} consumed by the dispatcher.
 * Returns `null` when the event is irrelevant or cannot be decoded safely.
 */
export async function buildPermissionContractEvent(
  raw: RawRpcEvent
): Promise<PermissionContractEvent | null> {
  if (raw.topic.length < 2) return null;
  const prefix = raw.topic[0].toString().toLowerCase();
  if (prefix !== PERM_PREFIX) return null;
  const second = raw.topic[1].toString().toLowerCase();
  if (!isPermissionTopicName(second)) return null;
  const eventType = mapTopicToEventType(second);
  if (!eventType) return null;

  let body: DecodedPermissionBody | null = null;
  try {
    body = decodeBody(raw.bodyXdr);
  } catch {
    return null;
  }
  if (!body?.owner || !body?.delegate) return null;

  const owner = scValToStellarAddress(body.owner);
  const delegate = scValToStellarAddress(body.delegate);
  if (!owner || !delegate) return null;

  let limitStroops: string | undefined;
  for (const key of ["per_tx_limit", "total_limit", "new_limit"] as const) {
    const v = body[key];
    if (!v) continue;
    const big = scValToBigIntString(v);
    if (big) {
      limitStroops = big;
      break;
    }
  }

  const expiresAtLedger = scValToU32OrNull(body.expires_at_ledger);

  return {
    contractId: raw.contractId,
    eventType,
    owner,
    delegate,
    limitStroops,
    expiresAtLedger,
    txHash: raw.txHash,
  };
}

// ---------------------------------------------------------------------------
// Listener handle
// ---------------------------------------------------------------------------

export interface PermissionEventListenerHandle {
  stop(): Promise<void>;
  pollOnce(): Promise<number>;
  processRawPermissionEvent(
    raw: RawRpcEvent
  ): Promise<{ emailSent: boolean; pushSent: boolean; skipped: boolean }>;
}

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_CURSOR_KEY = "notifications:permissions:ledgerCursor";
const MAX_LEDGER_RANGE = 100;

export function startPermissionEventListener(
  rpcUrl: string,
  contractId: string,
  depsIn: PermissionEventDeps = {}
): PermissionEventListenerHandle {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { rpc } = require("@stellar/stellar-sdk") as typeof import("@stellar/stellar-sdk");
  const server = new rpc.Server(rpcUrl, {
    allowHttp: rpcUrl.startsWith("http://"),
  });

  const dedupStore: ProcessedContractEventStore =
    depsIn.dedupStore ?? new InMemoryProcessedContractEventStore();
  const walletLookup: (a: string) => Promise<WalletNotificationTarget | null> =
    depsIn.walletLookup ??
    ((a) => getWalletLookupAdapter().lookupByWalletAddress(a));
  const sendEmailFn = depsIn.sendEmailFn ?? sendEmail;
  const sendPushFn = depsIn.sendPushFn ?? sendPushNotification;
  const redis: PermissionEventRedis = depsIn.redis ?? createLazyRedisFromEnv();
  const cursorKey = depsIn.cursorKey ?? DEFAULT_CURSOR_KEY;
  const intervalMs =
    depsIn.pollIntervalMs ??
    Number(process.env.PERMISSION_EVENT_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS);
  const startLedger =
    depsIn.startLedger ??
    Number(process.env.PERMISSION_EVENT_START_LEDGER ?? 0);

  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let shuttingDown = false;
  let cursor: number | null = null;
  let initialCursorLoaded = false;
  let latestLedgerTip = 0;

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
      log.warn("Failed to load cursor from Redis", {
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
      log.warn("Failed to persist listener cursor", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function refreshLedgerTip(): Promise<void> {
    try {
      const seq = await server.getLatestLedger();
      latestLedgerTip = Number(seq.sequence);
    } catch {
      // Ignore — purely advisory.
    }
  }

  async function fetchEvents(fromLedger: number): Promise<RawRpcEvent[]> {
    try {
      const response = await server.getEvents({
        startLedger: fromLedger,
        filters: [
          {
            type: "contract",
            contractIds: [contractId],
            topics: [[PERM_PREFIX]],
          },
        ],
      });
      return (response.events ?? []).map(
        (evt: {
          id: string;
          ledger: number;
          transactionIndex?: number;
          operationIndex?: number;
          contractId?: { toString(): string };
          topic: { toString(): string }[];
          value: { toXDR(): Buffer };
        }) => ({
          id: evt.id,
          ledger: evt.ledger,
          transactionIndex: evt.transactionIndex,
          operationIndex: evt.operationIndex,
          contractId: evt.contractId ? evt.contractId.toString() : contractId,
          txHash: evt.id,
          topic: evt.topic,
          bodyXdr: evt.value.toXDR().toString("base64"),
        })
      );
    } catch (err) {
      log.error("Failed to fetch permission events from RPC", {
        startLedger,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  async function dispatchPermissionEvent(
    event: PermissionContractEvent
  ): Promise<{ emailSent: boolean; pushSent: boolean }> {
    const target = await walletLookup(event.owner);
    if (!target) {
      log.info("No user found for owner address — skipping notification", {
        owner: event.owner,
        eventType: event.eventType,
        txHash: event.txHash,
      });
      return { emailSent: false, pushSent: false };
    }

    const eventId = deriveEventIdempotencyKeyFromContractEvent(event);

    let emailSent = false;
    let pushSent = false;

    if (target.email) {
      const dispatched = await checkAndMarkDispatched(
        redis as unknown as Parameters<typeof checkAndMarkDispatched>[0],
        {
          userId: target.userId,
          channel: "email",
          eventType: event.eventType,
          eventId,
        }
      );
      if (dispatched) {
        emailSent = await sendPermissionEmail(sendEmailFn, event, target);
      } else {
        log.info("Skipping duplicate permission email dispatch", {
          userId: target.userId,
          eventId,
        });
      }
    }

    if (target.pushEnabled) {
      const dispatched = await checkAndMarkDispatched(
        redis as unknown as Parameters<typeof checkAndMarkDispatched>[0],
        {
          userId: target.userId,
          channel: "push",
          eventType: event.eventType,
          eventId,
        }
      );
      if (dispatched) {
        pushSent = await sendPermissionPush(sendPushFn, event, target, redis);
      } else {
        log.info("Skipping duplicate permission push dispatch", {
          userId: target.userId,
          eventId,
        });
      }
    }

    return { emailSent, pushSent };
  }

  async function processRawPermissionEvent(
    raw: RawRpcEvent
  ): Promise<{ emailSent: boolean; pushSent: boolean; skipped: boolean }> {
    const dedupKey = deriveEventIdempotencyKey(raw);
    if (!dedupKey) {
      log.warn("Malformed event id — skipping", { id: raw.id });
      return { emailSent: false, pushSent: false, skipped: true };
    }

    if (await dedupStore.has(dedupKey)) {
      return { emailSent: false, pushSent: false, skipped: true };
    }

    const contractEvent = await buildPermissionContractEvent(raw);
    // Mark events processed regardless of relevance so subsequent polls
    // don't re-pay the XDR decode cost.
    await dedupStore.markProcessed(dedupKey, raw.contractId);

    if (!contractEvent) {
      return { emailSent: false, pushSent: false, skipped: true };
    }

    let emailSent = false;
    let pushSent = false;
    try {
      const result = await dispatchPermissionEvent(contractEvent);
      emailSent = result.emailSent;
      pushSent = result.pushSent;
    } catch (err) {
      log.error("Failed to dispatch permission event", {
        txHash: contractEvent.txHash,
        eventType: contractEvent.eventType,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return { emailSent, pushSent, skipped: false };
  }

  async function pollOnce(): Promise<number> {
    if (shuttingDown) return 0;
    const fromLedger = await loadCursor();
    await refreshLedgerTip();

    const events = await fetchEvents(fromLedger);
    if (events.length === 0) {
      const tip = latestLedgerTip > 0 ? latestLedgerTip : fromLedger;
      const advance = Math.max(
        1,
        Math.min(MAX_LEDGER_RANGE, tip - fromLedger + 1)
      );
      await persistCursor(fromLedger + advance);
      return 0;
    }

    let lastLedger = fromLedger;
    for (const evt of events) {
      try {
        await processRawPermissionEvent(evt);
        if (evt.ledger > lastLedger) lastLedger = evt.ledger;
      } catch (err) {
        log.error("Unhandled error processing permission event", {
          id: evt.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    await persistCursor(lastLedger + 1);
    return events.length;
  }

  async function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      const maybeUnref = (t as unknown as { unref?: () => void }).unref;
      if (typeof maybeUnref === "function") maybeUnref.call(t);
    });
  }

  async function loop(): Promise<void> {
    running = true;
    try {
      while (!shuttingDown) {
        await pollOnce();
        if (shuttingDown) break;
        await wait(intervalMs);
      }
    } finally {
      running = false;
    }
  }

  function schedule(): void {
    timer = setTimeout(() => {
      loop()
        .catch((err) => {
          log.error("Listener loop crashed — restarting after backoff", {
            error: err instanceof Error ? err.message : String(err),
          });
          if (!shuttingDown) schedule();
        });
    }, 50);
    const maybeUnref = (timer as unknown as { unref?: () => void }).unref;
    if (typeof maybeUnref === "function") maybeUnref.call(timer);
  }

  schedule();
  log.info("Permission event listener started", {
    rpcUrl,
    contractId,
    intervalMs,
  });

  return {
    async stop(): Promise<void> {
      shuttingDown = true;
      if (timer) clearTimeout(timer);
      const deadline = Date.now() + 5_000;
      while (running && Date.now() < deadline) {
        await wait(50);
      }
      log.info("Permission event listener stopped");
    },
    pollOnce,
    processRawPermissionEvent,
  };
}

// ---------------------------------------------------------------------------
// Dispatch helpers (kept module-private)
// ---------------------------------------------------------------------------

function deriveEventIdempotencyKeyFromContractEvent(
  event: PermissionContractEvent
): string {
  // The contract event payload exposes `txHash` which is the SDK composite
  // id.  Reuse the same parser so email + push share one key namespace.
  const parts = event.txHash.split("-");
  if (parts.length < 2) return event.txHash;
  const idx = Number(parts[parts.length - 1]);
  if (!Number.isFinite(idx) || idx < 0) return event.txHash;
  return `${parts.slice(0, -1).join(":")}:${event.eventType}:${idx}`;
}

async function sendPermissionEmail(
  send: typeof sendEmail,
  event: PermissionContractEvent,
  target: WalletNotificationTarget
): Promise<boolean> {
  try {
    await send({
      to: target.email!,
      subject: subjectForEvent(event.eventType),
      templateName: templateForEvent(event.eventType),
      templateData: {
        owner: event.owner,
        delegate: event.delegate,
        eventType: event.eventType,
        limitStroops: event.limitStroops ?? "—",
        expiresAtLedger: event.expiresAtLedger?.toString() ?? "—",
        txHash: event.txHash,
        contractId: event.contractId,
      },
    });
    return true;
  } catch (err) {
    log.error("Failed to send permission email", {
      error: err instanceof Error ? err.message : String(err),
      txHash: event.txHash,
    });
    return false;
  }
}

async function sendPermissionPush(
  send: typeof sendPushNotification,
  event: PermissionContractEvent,
  target: WalletNotificationTarget,
  redis: PermissionEventRedis
): Promise<boolean> {
  if (!target.pushEnabled) return false;
  const subs = await getUserPushSubscriptions(target.userId, redis);
  let anySent = false;
  for (const sub of subs) {
    const payload: PushPayload = payloadForEvent(event);
    try {
      await send(sub, payload);
      anySent = true;
    } catch (err) {
      log.error("Failed to send permission push notification", {
        error: err instanceof Error ? err.message : String(err),
        txHash: event.txHash,
      });
    }
  }
  return anySent;
}

async function getUserPushSubscriptions(
  userId: string,
  redis: PermissionEventRedis
): Promise<PushSubscription[]> {
  if (!redis.smembers) return [];
  try {
    const members = await redis.smembers(`push:subscriptions:${userId}`);
    return members.map((m) => JSON.parse(m) as PushSubscription);
  } catch (err) {
    log.warn("Failed to read push subscriptions", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

function templateForEvent(
  type: PermissionContractEvent["eventType"]
): string {
  switch (type) {
    case "permission_granted":
      return "permission-granted";
    case "permission_revoked":
      return "permission-revoked";
    case "permission_updated":
      return "permission-updated";
  }
}

function subjectForEvent(
  type: PermissionContractEvent["eventType"]
): string {
  switch (type) {
    case "permission_granted":
      return "A new delegation has been authorised";
    case "permission_revoked":
      return "A delegation has been revoked";
    case "permission_updated":
      return "A delegation has been updated";
  }
}

function payloadForEvent(event: PermissionContractEvent): PushPayload {
  const copy = {
    permission_granted: {
      title: "Delegation granted",
      body: `${truncate(event.delegate)} can now spend on your behalf`,
    },
    permission_revoked: {
      title: "Delegation revoked",
      body: `${truncate(event.delegate)} no longer has permission`,
    },
    permission_updated: {
      title: "Delegation updated",
      body: `${truncate(event.delegate)}'s permission changed`,
    },
  } as const;
  const entry = copy[event.eventType];
  return {
    title: entry.title,
    body: entry.body,
    data: {
      type: event.eventType,
      contractId: event.contractId,
      owner: event.owner,
      delegate: event.delegate,
      limitStroops: event.limitStroops,
      expiresAtLedger: event.expiresAtLedger,
      txHash: event.txHash,
    },
  };
}

function truncate(addr: string, headChars = 6, tailChars = 4): string {
  if (addr.length <= headChars + tailChars + 2) return addr;
  return `${addr.slice(0, headChars)}…${addr.slice(-tailChars)}`;
}

// ---------------------------------------------------------------------------
// Redis stub factory
// ---------------------------------------------------------------------------

type InternalInMemoryRedis = {
  set(...args: Parameters<PermissionEventRedis["set"]>): ReturnType<PermissionEventRedis["set"]>;
  get(key: string): Promise<string | null>;
  smembers(key: string): Promise<string[]>;
  __addSetForTests(key: string, members: string[]): void;
  __setKvForTests(key: string, value: string): void;
  __getKvForTests(key: string): string | undefined;
};

function createLazyRedisFromEnv(): PermissionEventRedis {
  const isTest =
    process.env.NODE_ENV === "test" ||
    process.env.MOCK_REDIS === "true" ||
    process.env.CI === "true";
  if (isTest) {
    log.info("Using in-memory Redis stub for permission event listener");
    return makeInMemoryRedis();
  }
  const _require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Redis } = _require("ioredis") as any;
  const client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });
  return client as unknown as PermissionEventRedis;
}

/**
 * Public, deterministic in-memory Redis stub that honours `EX`/`NX` and
 * exposes an `smembers` for push-subscription lookup.  Test-only helpers
 * (`__addSetForTests`, `__setKvForTests`, `__getKvForTests`) are clearly
 * flagged so they are not used in production paths.
 */
export function makeInMemoryRedis(): InternalInMemoryRedis {
  const kv = new Map<string, { value: string; expiresAt: number }>();
  const sets = new Map<string, Set<string>>();
  const internal: InternalInMemoryRedis = {
    async set(key, value, ...args) {
      let ttlSec: number | undefined;
      let onlyIfNew = false;
      for (let i = 0; i < args.length; i++) {
        const a = String(args[i]).toUpperCase();
        if (a === "EX") ttlSec = Number(args[++i]);
        else if (a === "NX") onlyIfNew = true;
      }
      const now = Date.now();
      const existing = kv.get(key);
      if (existing && existing.expiresAt <= now) kv.delete(key);
      if (onlyIfNew && kv.has(key)) return null;
      const expiresAt =
        typeof ttlSec === "number" && ttlSec > 0
          ? now + ttlSec * 1000
          : Number.POSITIVE_INFINITY;
      kv.set(key, { value, expiresAt });
      return "OK";
    },
    async get(key) {
      const entry = kv.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        kv.delete(key);
        return null;
      }
      return entry.value;
    },
    async smembers(key) {
      return Array.from(sets.get(key) ?? []);
    },
    __addSetForTests(key, members) {
      let bucket = sets.get(key);
      if (!bucket) {
        bucket = new Set<string>();
        sets.set(key, bucket);
      }
      for (const m of members) bucket.add(m);
    },
    __setKvForTests(key, value) {
      kv.set(key, {
        value,
        expiresAt: Number.POSITIVE_INFINITY,
      });
    },
    __getKvForTests(key) {
      return kv.get(key)?.value;
    },
  };
  return internal;
}
