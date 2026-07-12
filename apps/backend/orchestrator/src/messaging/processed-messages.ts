// Issue #217 — Processed message deduplication for idempotent workers

export interface ProcessedMessageRecord {
  messageId: string;
  consumer: string;
  processedAt: string;
}

export interface ProcessedMessageStore {
  /**
   * Atomically claims a message for processing.
   * Returns true when this is the first claim (proceed), false on duplicate (skip).
   */
  checkAndMark(messageId: string, consumer: string): Promise<boolean>;
}

/** In-memory store for tests and local development. */
export class InMemoryProcessedMessageStore implements ProcessedMessageStore {
  private readonly processed = new Map<string, ProcessedMessageRecord>();

  async checkAndMark(messageId: string, consumer: string): Promise<boolean> {
    if (this.processed.has(messageId)) {
      return false;
    }

    this.processed.set(messageId, {
      messageId,
      consumer,
      processedAt: new Date().toISOString(),
    });
    return true;
  }

  /** Test helper — returns whether a message id was recorded. */
  has(messageId: string): boolean {
    return this.processed.has(messageId);
  }

  clear(): void {
    this.processed.clear();
  }
}

let processedMessageStore: ProcessedMessageStore = new InMemoryProcessedMessageStore();

/** Swap the backing store for a Postgres implementation in production. */
export function setProcessedMessageStore(store: ProcessedMessageStore): void {
  processedMessageStore = store;
}

export function resetProcessedMessageStore(): void {
  processedMessageStore = new InMemoryProcessedMessageStore();
}

/**
 * Idempotently claims a message for a named consumer.
 * Returns true on first delivery (proceed), false when already processed (skip).
 *
 * Postgres implementations should use
 * `INSERT ... ON CONFLICT (message_id) DO NOTHING RETURNING message_id`.
 *
 * Backed by `processed_messages` (see database/migrations/006_processed_messages.sql).
 */
export async function checkAndMarkProcessed(
  messageId: string,
  consumer: string
): Promise<boolean> {
  if (!messageId || messageId.trim() === "") {
    throw new Error("messageId is required");
  }

  if (!consumer || consumer.trim() === "") {
    throw new Error("consumer is required");
  }

  return processedMessageStore.checkAndMark(messageId, consumer);
}
