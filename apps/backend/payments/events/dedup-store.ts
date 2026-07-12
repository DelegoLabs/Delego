// Issue #128 — Escrow contract event deduplication store

export interface ProcessedContractEventRecord {
  eventId: string;
  contractId: string;
  processedAt: string;
}

export interface ProcessedContractEventStore {
  has(eventId: string): Promise<boolean>;
  markProcessed(eventId: string, contractId: string): Promise<void>;
}

/** Deterministic event id derived from ledger tx hash and event index. */
export function deriveContractEventId(txHash: string, eventIndex: number): string {
  return `${txHash}:${eventIndex}`;
}

/** In-memory store for tests and local development. */
export class InMemoryProcessedContractEventStore implements ProcessedContractEventStore {
  private readonly processed = new Map<string, ProcessedContractEventRecord>();

  async has(eventId: string): Promise<boolean> {
    return this.processed.has(eventId);
  }

  async markProcessed(eventId: string, contractId: string): Promise<void> {
    this.processed.set(eventId, {
      eventId,
      contractId,
      processedAt: new Date().toISOString(),
    });
  }
}

export interface EscrowContractEvent {
  txHash: string;
  eventIndex: number;
  contractId: string;
  type: string;
  payload: Record<string, unknown>;
}

export type EscrowContractEventHandler = (event: EscrowContractEvent) => Promise<void> | void;

/**
 * Processes an escrow contract event once. Duplicate deliveries are skipped
 * using the processed_contract_events store (see database/migrations/004_*).
 */
export async function processEscrowContractEvent(
  event: EscrowContractEvent,
  handler: EscrowContractEventHandler,
  store: ProcessedContractEventStore
): Promise<boolean> {
  const eventId = deriveContractEventId(event.txHash, event.eventIndex);

  if (await store.has(eventId)) {
    return false;
  }

  await handler(event);
  await store.markProcessed(eventId, event.contractId);
  return true;
}
