/**
 * #347 — Workflow timeout detection and dead letter queue.
 *
 * A "stuck" workflow is one whose saga record has been in a non-terminal
 * status ("running" | "compensating") beyond a configurable timeout without
 * its `updatedAt` advancing.
 *
 * When a stuck workflow is found:
 *   1. If automatic compensation is possible, it is attempted via the saga
 *      coordinator's `resume()` path (which invokes compensation internally).
 *   2. If compensation is not possible (or fails), the saga record is moved
 *      to the dead letter queue (DLQ) for manual operator review.
 *
 * The dead letter store is an in-memory map in tests; replace with a Postgres-
 * backed implementation in production by calling `setDeadLetterStore()`.
 *
 * `claim_expires_at` in the SagaRecord already tracks lease windows for
 * concurrency safety — the timeout checker consults `updatedAt` instead, which
 * is a coarser, wall-clock signal that is unaffected by lease churn.
 */

import { createLogger } from "@delego/utils";
import type { SagaRecord, SagaStore } from "../src/saga/types.js";

const log = createLogger("orchestrator:timeout", process.env.LOG_LEVEL ?? "info");

/** Default wall-clock inactivity threshold before a workflow is considered stuck. */
export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ─── Dead Letter types ────────────────────────────────────────────────────────

export interface DeadLetterEntry {
  sagaId: string;
  orderId: string;
  reason: string;
  originalStatus: string;
  movedAt: Date;
  context: Record<string, unknown>;
}

export interface DeadLetterStore {
  push(entry: DeadLetterEntry): Promise<void>;
  list(): Promise<DeadLetterEntry[]>;
}

// ─── In-memory DLQ (swap for a Postgres-backed impl in production) ────────────

class InMemoryDeadLetterStore implements DeadLetterStore {
  private readonly entries: DeadLetterEntry[] = [];

  async push(entry: DeadLetterEntry): Promise<void> {
    this.entries.push({ ...entry });
  }

  async list(): Promise<DeadLetterEntry[]> {
    return [...this.entries];
  }
}

let deadLetterStore: DeadLetterStore = new InMemoryDeadLetterStore();

/** Swap the DLQ backend (e.g. for production Postgres or test doubles). */
export function setDeadLetterStore(store: DeadLetterStore): void {
  deadLetterStore = store;
}

/** Reset to the built-in in-memory store (useful in tests). */
export function resetDeadLetterStore(): void {
  deadLetterStore = new InMemoryDeadLetterStore();
}

// ─── Timeout detection ────────────────────────────────────────────────────────

export interface StuckWorkflow {
  sagaId: string;
  orderId: string;
  status: string;
  stuckSinceMs: number;
}

/**
 * Scans all incomplete saga records and returns the ones whose `updatedAt`
 * is older than `timeoutMs` milliseconds.
 *
 * @param store      SagaStore to scan.
 * @param timeoutMs  Inactivity threshold in milliseconds (default: 30 min).
 */
export async function findStuckWorkflows(
  store: SagaStore,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<StuckWorkflow[]> {
  const incomplete = await store.listIncomplete();
  const now = Date.now();
  const stuck: StuckWorkflow[] = [];

  for (const record of incomplete) {
    const idleMs = now - record.updatedAt.getTime();
    if (idleMs >= timeoutMs) {
      stuck.push({
        sagaId: record.sagaId,
        orderId: record.orderId,
        status: record.status,
        stuckSinceMs: idleMs,
      });
    }
  }

  log.debug("Timeout scan complete", {
    scanned: incomplete.length,
    stuck: stuck.length,
  });

  return stuck;
}

// ─── Dead letter queue ────────────────────────────────────────────────────────

/**
 * Moves a saga record into the dead letter queue.
 * The original record is not deleted from the saga store — it remains in its
 * current state so operators can inspect and manually replay it.
 */
export async function moveToDeadLetter(
  record: SagaRecord,
  reason: string,
  dlq: DeadLetterStore = deadLetterStore,
): Promise<DeadLetterEntry> {
  const entry: DeadLetterEntry = {
    sagaId: record.sagaId,
    orderId: record.orderId,
    reason,
    originalStatus: record.status,
    movedAt: new Date(),
    context: structuredClone(record.context),
  };

  await dlq.push(entry);

  log.warn("Workflow moved to dead letter queue", {
    sagaId: record.sagaId,
    orderId: record.orderId,
    reason,
  });

  return entry;
}

/** Returns all entries currently in the dead letter queue (for admin/monitoring endpoints). */
export async function listDeadLetterEntries(
  dlq: DeadLetterStore = deadLetterStore,
): Promise<DeadLetterEntry[]> {
  return dlq.list();
}

// ─── Unified timeout processor ────────────────────────────────────────────────

export interface TimeoutProcessorResult {
  /** Saga IDs that were successfully auto-compensated. */
  compensated: string[];
  /** Saga IDs moved to the DLQ (compensation failed or was not applicable). */
  movedToDlq: string[];
}

/**
 * Finds stuck workflows and attempts to compensate each one.
 *
 * The `tryCompensate` callback should attempt to resume/compensate the saga
 * (e.g. by calling `SagaCoordinator.resume()`) and return `true` on success.
 * When it returns `false` or throws, the workflow is moved to the DLQ instead.
 *
 * @param store          SagaStore to scan.
 * @param tryCompensate  Optional compensation callback. When omitted, all stuck
 *                       workflows are moved directly to the DLQ.
 * @param timeoutMs      Inactivity threshold in milliseconds.
 * @param dlq            DLQ store to use (defaults to module-level store).
 */
export async function processTimedOutWorkflows(
  store: SagaStore,
  tryCompensate?: (sagaId: string) => Promise<boolean>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  dlq: DeadLetterStore = deadLetterStore,
): Promise<TimeoutProcessorResult> {
  const stuck = await findStuckWorkflows(store, timeoutMs);

  if (stuck.length === 0) {
    log.debug("No stuck workflows found");
    return { compensated: [], movedToDlq: [] };
  }

  log.info("Processing stuck workflows", { count: stuck.length });

  const compensated: string[] = [];
  const movedToDlq: string[] = [];

  for (const item of stuck) {
    let compensationSucceeded = false;

    if (tryCompensate) {
      try {
        compensationSucceeded = await tryCompensate(item.sagaId);
      } catch (err) {
        log.error("Automatic compensation failed for stuck workflow", {
          sagaId: item.sagaId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (compensationSucceeded) {
      compensated.push(item.sagaId);
    } else {
      // Load the full record so we can copy context into the DLQ entry
      const record = await store.get(item.sagaId);
      if (record) {
        await moveToDeadLetter(
          record,
          `Workflow stuck for ${Math.round(item.stuckSinceMs / 1000)}s — automatic compensation unavailable`,
          dlq,
        );
      }
      movedToDlq.push(item.sagaId);
    }
  }

  log.info("Timeout processing complete", {
    compensated: compensated.length,
    movedToDlq: movedToDlq.length,
  });

  return { compensated, movedToDlq };
}
