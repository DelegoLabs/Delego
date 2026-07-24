/**
 * Workflow Event Sourcing and Replay (Issue #354)
 *
 * Records every workflow event with full metadata, enabling:
 * - Complete event history for debugging and audit
 * - State reconstruction from events (replay)
 * - Retention-based cleanup of old events
 */

import { createLogger } from "@delego/utils";
import type { PurchaseEvent, PurchaseState, PurchaseContext, WorkflowSnapshot } from "../../state/types.js";
import { PurchaseWorkflowMachine } from "../../state/machine.js";

const log = createLogger("orchestrator:event-store", process.env.LOG_LEVEL ?? "info");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowEventRecord {
  id: string;
  workflowId: string;
  eventType: string;
  payload: PurchaseEvent;
  fromState: PurchaseState | null;
  toState: PurchaseState;
  metadata: Record<string, unknown>;
  recordedAt: Date;
}

export interface EventStoreStats {
  totalEvents: number;
  workflowsTracked: number;
  oldestEvent: Date | null;
  newestEvent: Date | null;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface WorkflowEventStore {
  /** Persist a workflow event with metadata. */
  record(event: WorkflowEventRecord): Promise<void>;
  /** Retrieve all events for a workflow, ordered by time. */
  getEvents(workflowId: string): Promise<WorkflowEventRecord[]>;
  /** Get aggregate statistics. */
  stats(): Promise<EventStoreStats>;
  /** Delete events older than the given date. */
  cleanup(retentionCutoff: Date): Promise<number>;
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

export class InMemoryWorkflowEventStore implements WorkflowEventStore {
  private events: WorkflowEventRecord[] = [];

  async record(event: WorkflowEventRecord): Promise<void> {
    this.events.push(event);
  }

  async getEvents(workflowId: string): Promise<WorkflowEventRecord[]> {
    return this.events
      .filter((e) => e.workflowId === workflowId)
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  }

  async stats(): Promise<EventStoreStats> {
    const workflowIds = new Set(this.events.map((e) => e.workflowId));
    return {
      totalEvents: this.events.length,
      workflowsTracked: workflowIds.size,
      oldestEvent: this.events.length > 0 ? this.events[0].recordedAt : null,
      newestEvent: this.events.length > 0 ? this.events[this.events.length - 1].recordedAt : null,
    };
  }

  async cleanup(retentionCutoff: Date): Promise<number> {
    const before = this.events.length;
    this.events = this.events.filter((e) => e.recordedAt >= retentionCutoff);
    return before - this.events.length;
  }
}

// ---------------------------------------------------------------------------
// Global store singleton
// ---------------------------------------------------------------------------

let globalStore: WorkflowEventStore = new InMemoryWorkflowEventStore();

export function getWorkflowEventStore(): WorkflowEventStore {
  return globalStore;
}

export function setWorkflowEventStore(store: WorkflowEventStore): void {
  globalStore = store;
}

// ---------------------------------------------------------------------------
// Event recording
// ---------------------------------------------------------------------------

let idCounter = 0;

export function createWorkflowEventRecord(params: {
  workflowId: string;
  eventType: string;
  payload: PurchaseEvent;
  fromState: PurchaseState | null;
  toState: PurchaseState;
  metadata?: Record<string, unknown>;
}): WorkflowEventRecord {
  return {
    id: `evt_${Date.now()}_${++idCounter}`,
    workflowId: params.workflowId,
    eventType: params.eventType,
    payload: params.payload,
    fromState: params.fromState,
    toState: params.toState,
    metadata: params.metadata ?? {},
    recordedAt: new Date(),
  };
}

/**
 * Record a workflow event to the store. This is a convenience wrapper
 * that creates the record and persists it.
 */
export async function recordWorkflowEvent(params: {
  workflowId: string;
  eventType: string;
  payload: PurchaseEvent;
  fromState: PurchaseState | null;
  toState: PurchaseState;
  metadata?: Record<string, unknown>;
}): Promise<WorkflowEventRecord> {
  const store = getWorkflowEventStore();
  const record = createWorkflowEventRecord(params);
  await store.record(record);

  log.info("Workflow event recorded", {
    workflowId: params.workflowId,
    eventType: params.eventType,
    fromState: params.fromState,
    toState: params.toState,
  });

  return record;
}

// ---------------------------------------------------------------------------
// Replay: reconstruct state from events
// ---------------------------------------------------------------------------

/**
 * Replay a sequence of events to reconstruct the current workflow state.
 * Returns the final snapshot after applying all events in order.
 *
 * @throws When events cannot be applied to the machine (invalid transition).
 */
export async function replayWorkflowEvents(
  events: WorkflowEventRecord[],
  initialContext: Pick<PurchaseContext, "workflowId" | "delegationId" | "userId">,
): Promise<WorkflowSnapshot> {
  if (events.length === 0) {
    throw new Error("No events to replay");
  }

  const machine = new PurchaseWorkflowMachine(initialContext);

  for (const event of events) {
    await machine.send(event.payload as PurchaseEvent);
  }

  return machine.getSnapshot();
}

/**
 * Replay events from the store and return the reconstructed snapshot.
 */
export async function replayFromStore(
  store: WorkflowEventStore,
  workflowId: string,
  initialContext: Pick<PurchaseContext, "workflowId" | "delegationId" | "userId">,
): Promise<WorkflowSnapshot> {
  const events = await store.getEvents(workflowId);
  if (events.length === 0) {
    throw new Error(`No events found for workflow ${workflowId}`);
  }
  return replayWorkflowEvents(events, initialContext);
}

// ---------------------------------------------------------------------------
// Retention cleanup
// ---------------------------------------------------------------------------

/**
 * Clean up old events based on retention policy.
 * @param retentionDays - Number of days to retain events. Default: 30.
 * @returns Number of events removed.
 */
export async function cleanupOldEvents(retentionDays: number = 30): Promise<number> {
  const store = getWorkflowEventStore();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const removed = await store.cleanup(cutoff);

  if (removed > 0) {
    log.info("Cleaned up old workflow events", { removed, retentionDays });
  }

  return removed;
}
