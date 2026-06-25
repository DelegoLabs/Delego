/** Saga coordinator pattern — core types shared by all saga implementations */

export type SagaStatus = "running" | "compensating" | "completed" | "failed";

export interface SagaStep<TContext = Record<string, unknown>> {
  name: string;
  action: (context: TContext) => Promise<TContext>;
  compensation: (context: TContext, error: Error) => Promise<TContext>;
}

export interface SagaExecution {
  sagaId: string;
  orderId: string;
  status: SagaStatus;
  completedSteps: string[];
}

/** Durable representation of a SagaExecution, including the data needed to resume it. */
export interface SagaRecord<TContext = Record<string, unknown>> extends SagaExecution {
  context: TContext;
  currentStep: string | null;
  error: string | null;
  /** Optimistic-concurrency counter — bumped on every save() so two runners can never both win a step claim. */
  version: number;
  /**
   * Lease expiry for the in-progress `currentStep`. A step can only be reclaimed once this is
   * null or in the past — without it, version-checked saves alone don't stop a second runner
   * from re-claiming (and re-executing) a step that's already being worked on at a newer version.
   */
  claimExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Thrown by SagaStore.save() when `record.version` no longer matches the persisted version. */
export class SagaConcurrencyError extends Error {
  constructor(sagaId: string) {
    super(`Saga ${sagaId} was modified by another runner — aborting to avoid duplicate step execution`);
    this.name = "SagaConcurrencyError";
  }
}

/**
 * Persistence boundary for saga progress. Implementations must make save() safe to call
 * repeatedly with the same record (upsert), since a crash can interrupt execution between
 * a step completing and the saga advancing to the next one.
 */
export interface SagaStore {
  /** Inserts a new saga record. Returns the existing record if sagaId already exists (idempotent start). */
  createIfNotExists(record: SagaRecord): Promise<SagaRecord>;
  get(sagaId: string): Promise<SagaRecord | null>;
  /**
   * Persists record and returns the stored copy with `version` incremented. Throws
   * SagaConcurrencyError if `record.version` doesn't match the persisted version, which is how
   * callers detect that another runner already claimed this step.
   */
  save(record: SagaRecord): Promise<SagaRecord>;
  /** Sagas left in "running" or "compensating" — used to resume after an orchestrator crash. */
  listIncomplete(): Promise<SagaRecord[]>;
}
