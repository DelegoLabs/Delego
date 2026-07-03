// Issue #216 — Service event outbox for reliable Redis publishing

import { randomUUID } from "node:crypto";

export type ServiceEventOutboxStatus = "pending" | "published" | "failed";

export interface ServiceEventOutboxRecord {
  id: string;
  topic: string;
  payload: Record<string, unknown>;
  status: ServiceEventOutboxStatus;
  createdAt: string;
}

export interface InsertServiceEventOutboxInput {
  topic: string;
  payload: Record<string, unknown>;
  status?: ServiceEventOutboxStatus;
}

export interface ServiceEventOutboxStore {
  insert(input: InsertServiceEventOutboxInput): Promise<ServiceEventOutboxRecord>;
}

/**
 * Expected publisher behavior:
 *
 * 1. Write the event to `service_event_outbox` in the same DB transaction as the
 *    domain mutation (status defaults to `pending`).
 * 2. A background relay worker polls rows where status = `pending`, publishes to
 *    Redis using `topic` as the stream/channel key, then marks status `published`.
 * 3. On publish failure after retries, mark status `failed` for manual replay.
 * 4. Consumers must not rely on the outbox row alone — use `processed_messages`
 *    (Issue #217) for idempotent handling after delivery.
 */
export class InMemoryServiceEventOutboxStore implements ServiceEventOutboxStore {
  private readonly rows: ServiceEventOutboxRecord[] = [];

  async insert(input: InsertServiceEventOutboxInput): Promise<ServiceEventOutboxRecord> {
    const record: ServiceEventOutboxRecord = {
      id: randomUUID(),
      topic: input.topic,
      payload: input.payload,
      status: input.status ?? "pending",
      createdAt: new Date().toISOString(),
    };
    this.rows.push(record);
    return record;
  }

  /** Test helper — returns a snapshot of stored rows. */
  snapshot(): readonly ServiceEventOutboxRecord[] {
    return [...this.rows];
  }

  clear(): void {
    this.rows.length = 0;
  }
}

let outboxStore: ServiceEventOutboxStore = new InMemoryServiceEventOutboxStore();

/** Swap the backing store for a Postgres implementation in production. */
export function setServiceEventOutboxStore(store: ServiceEventOutboxStore): void {
  outboxStore = store;
}

export function resetServiceEventOutboxStore(): void {
  outboxStore = new InMemoryServiceEventOutboxStore();
}

/**
 * Inserts a pending outbox row before publishing critical Redis events.
 * Backed by `service_event_outbox` (see database/migrations/005_service_event_outbox.sql).
 */
export async function insertServiceEventOutbox(
  input: InsertServiceEventOutboxInput
): Promise<ServiceEventOutboxRecord> {
  if (!input.topic || input.topic.trim() === "") {
    throw new Error("topic is required");
  }

  if (input.payload == null || typeof input.payload !== "object" || Array.isArray(input.payload)) {
    throw new Error("payload must be a JSON object");
  }

  return outboxStore.insert(input);
}
