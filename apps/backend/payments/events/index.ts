import {
  InMemoryProcessedContractEventStore,
  processEscrowContractEvent,
  type EscrowContractEvent,
  type ProcessedContractEventStore,
} from "./dedup-store.js";

export type PaymentEventType =
  | "escrow_created"
  | "escrow_released"
  | "escrow_refunded"
  | "settlement_complete";

export interface PaymentEvent {
  type: PaymentEventType;
  orderId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

let processedEventStore: ProcessedContractEventStore = new InMemoryProcessedContractEventStore();

/** Swap the backing store for a DB-backed implementation in production. */
export function setProcessedContractEventStore(store: ProcessedContractEventStore): void {
  processedEventStore = store;
}

export function resetProcessedContractEventStore(): void {
  processedEventStore = new InMemoryProcessedContractEventStore();
}

/** Emit payment events — TODO: Publish to event bus / analytics */
export function emitPaymentEvent(_event: PaymentEvent): void {
  // TODO: Implement event publishing
}

/**
 * Handles on-chain escrow contract events with deduplication.
 * Duplicate blockchain deliveries are skipped after the first successful process.
 *
 * Backed by `processed_contract_events` (see database/migrations/004_processed_contract_events.sql).
 */
export async function handleEscrowContractEvent(
  event: EscrowContractEvent,
  onProcess: (paymentEvent: PaymentEvent) => Promise<void> | void
): Promise<boolean> {
  return processEscrowContractEvent(
    event,
    async (contractEvent) => {
      await onProcess({
        type: contractEvent.type as PaymentEventType,
        orderId: String(contractEvent.payload.orderId ?? ""),
        timestamp: new Date().toISOString(),
        payload: contractEvent.payload,
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
