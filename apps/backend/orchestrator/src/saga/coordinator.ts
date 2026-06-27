import { createLogger, type Logger } from "@delego/utils";
import { SagaConcurrencyError, type SagaRecord, type SagaStep, type SagaStore } from "./types.js";

const DEFAULT_CLAIM_LEASE_MS = 30_000;

export interface SagaCoordinatorOptions<TContext> {
  /** Saga steps in the order they should execute. Compensations run in reverse order. */
  steps: Array<SagaStep<TContext>>;
  store: SagaStore;
  log?: Logger;
  /** How long a step claim is honored before another runner may safely reclaim it. */
  claimLeaseMs?: number;
}

/**
 * Runs an ordered set of saga steps against a durable store, compensating completed
 * steps in reverse order if any step fails. Safe to call run()/resume() repeatedly for
 * the same sagaId — already-completed steps are skipped, which makes retries idempotent
 * and lets execution resume cleanly after an orchestrator crash.
 */
export class SagaCoordinator<TContext extends Record<string, unknown>> {
  private readonly steps: Map<string, SagaStep<TContext>>;
  private readonly stepOrder: string[];
  private readonly store: SagaStore;
  private readonly log: Logger;
  private readonly claimLeaseMs: number;

  constructor(options: SagaCoordinatorOptions<TContext>) {
    if (options.steps.length === 0) {
      throw new Error("SagaCoordinator requires at least one step");
    }
    const seen = new Set<string>();
    for (const step of options.steps) {
      if (seen.has(step.name)) {
        throw new Error(`Duplicate saga step name: ${step.name}`);
      }
      seen.add(step.name);
    }
    this.steps = new Map(options.steps.map((step) => [step.name, step]));
    this.stepOrder = options.steps.map((step) => step.name);
    this.store = options.store;
    this.log = options.log ?? createLogger("orchestrator:saga");
    const claimLeaseMs = options.claimLeaseMs ?? DEFAULT_CLAIM_LEASE_MS;
    if (!Number.isSafeInteger(claimLeaseMs) || claimLeaseMs <= 0) {
      throw new Error("claimLeaseMs must be a positive safe integer");
    }
    this.claimLeaseMs = claimLeaseMs;
  }

  /** Starts a new saga, or resumes it if sagaId was already started (idempotent). */
  async run(sagaId: string, orderId: string, initialContext: TContext): Promise<SagaRecord<TContext>> {
    const now = new Date();
    const record = await this.store.createIfNotExists({
      sagaId,
      orderId,
      status: "running",
      completedSteps: [],
      context: initialContext,
      currentStep: this.stepOrder[0] ?? null,
      error: null,
      version: 0,
      claimExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    });
    // createIfNotExists() can return a previously completed/failed record — treat both as
    // terminal so a retried run() never restarts a saga that already finished.
    if (record.status === "completed" || record.status === "failed") {
      return record as SagaRecord<TContext>;
    }
    return this.advance(record as SagaRecord<TContext>);
  }

  /** Continues a previously started saga from its persisted state — used for crash recovery and manual retries. */
  async resume(sagaId: string): Promise<SagaRecord<TContext>> {
    const record = await this.store.get(sagaId);
    if (!record) {
      throw new Error(`Saga not found: ${sagaId}`);
    }
    if (record.status === "completed" || record.status === "failed") {
      return record as SagaRecord<TContext>;
    }
    return this.advance(record as SagaRecord<TContext>);
  }

  /** Resumes every saga left in "running" or "compensating" — call once at startup. */
  async recoverAll(): Promise<void> {
    const incomplete = await this.store.listIncomplete();
    for (const record of incomplete) {
      this.log.warn("Recovering incomplete saga after restart", {
        sagaId: record.sagaId,
        status: record.status,
      });
      await this.recoverOne(record.sagaId);
    }
  }

  private async recoverOne(sagaId: string): Promise<void> {
    try {
      const result = await this.resume(sagaId);
      this.scheduleRetryIfLeased(result);
      // resume() backs off with the pre-claim record on a lost SagaConcurrencyError race, which
      // may not carry the winner's claimExpiresAt — re-read the store so the retry is scheduled
      // against the lease that's actually live, not a stale snapshot that looks lease-free.
      if ((result.status === "running" || result.status === "compensating") && !result.claimExpiresAt) {
        const latest = await this.store.get(sagaId);
        if (latest) this.scheduleRetryIfLeased(latest as SagaRecord<TContext>);
      }
    } catch (err) {
      this.log.error("Saga recovery failed", {
        sagaId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * If resume() backed off because the step's lease (held by a runner that may since have
   * crashed) hasn't expired yet, schedule a single retry for just after it does — otherwise a
   * pre-crash lease leaves the saga stuck until an operator calls /resume manually.
   */
  private scheduleRetryIfLeased(record: SagaRecord<TContext>): void {
    if (record.status !== "running" && record.status !== "compensating") return;
    if (!record.claimExpiresAt) return;

    const delayMs = record.claimExpiresAt.getTime() - Date.now();
    if (delayMs <= 0) return;

    setTimeout(() => {
      void this.recoverOne(record.sagaId);
    }, delayMs + 50);
  }

  private async advance(record: SagaRecord<TContext>): Promise<SagaRecord<TContext>> {
    if (record.status === "compensating") {
      return this.compensate(record, new Error(record.error ?? "Saga failed"));
    }

    let current = record;
    const remaining = this.stepOrder.filter((name) => !current.completedSteps.includes(name));

    for (const stepName of remaining) {
      const step = this.steps.get(stepName);
      if (!step) {
        throw new Error(`Unknown saga step: ${stepName}`);
      }

      const claimed = await this.claimStep(current, stepName);
      if (!claimed) return current;
      current = claimed;

      let context: TContext;
      try {
        context = await step.action(current.context);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.log.error("Saga step failed, starting compensation", {
          sagaId: current.sagaId,
          step: stepName,
          error: error.message,
        });
        current = await this.save({
          ...current,
          status: "compensating",
          error: error.message,
          claimExpiresAt: null,
          updatedAt: new Date(),
        });
        return this.compensate(current, error);
      }

      // A failure here is a persistence problem, not a step failure — the action already
      // succeeded, so this must bubble up for recovery/retry rather than trigger compensation.
      current = await this.save({
        ...current,
        context,
        completedSteps: [...current.completedSteps, stepName],
        claimExpiresAt: null,
        updatedAt: new Date(),
      });
    }

    return this.save({ ...current, status: "completed", currentStep: null, claimExpiresAt: null, updatedAt: new Date() });
  }

  private async compensate(record: SagaRecord<TContext>, error: Error): Promise<SagaRecord<TContext>> {
    let current = record;
    const toCompensate = [...current.completedSteps].reverse();

    for (const stepName of toCompensate) {
      const step = this.steps.get(stepName);
      if (!step) {
        // A completed step with no registered handler means its side effect can never be
        // compensated — that's a saga integrity error, not something to paper over.
        const missingStep = new Error(`Unknown saga step during compensation: ${stepName}`);
        await this.save({ ...current, error: missingStep.message, updatedAt: new Date() });
        throw missingStep;
      }

      const claimed = await this.claimStep(current, stepName);
      if (!claimed) return current;
      current = claimed;

      let context: TContext;
      try {
        context = await step.compensation(current.context, error);
      } catch (compErr) {
        const compensationError = compErr instanceof Error ? compErr : new Error(String(compErr));
        this.log.error("Compensation step failed — saga left in compensating state for retry", {
          sagaId: current.sagaId,
          step: stepName,
          error: compensationError.message,
        });
        // Release the lease so a subsequent resume()/recoverAll() doesn't have to wait out a
        // lease held by a runner that has already given up on this step.
        await this.save({ ...current, claimExpiresAt: null, updatedAt: new Date() });
        throw compensationError;
      }

      current = await this.save({
        ...current,
        context,
        completedSteps: current.completedSteps.filter((name) => name !== stepName),
        claimExpiresAt: null,
        updatedAt: new Date(),
      });
    }

    return this.save({ ...current, status: "failed", currentStep: null, claimExpiresAt: null, updatedAt: new Date() });
  }

  /**
   * Durably claims a step before its action/compensation runs, so the persisted record always
   * reflects in-progress work before any side effect fires. The version check alone only stops
   * two runners from claiming the *same* version simultaneously — it doesn't stop a second runner
   * from reading the already-claimed record and re-claiming the same step at the next version. The
   * lease (`claimExpiresAt`) closes that gap: a step already claimed by a live lease is refused.
   */
  private async claimStep(record: SagaRecord<TContext>, stepName: string): Promise<SagaRecord<TContext> | null> {
    if (record.currentStep === stepName && record.claimExpiresAt && record.claimExpiresAt.getTime() > Date.now()) {
      this.log.warn("Step already claimed by another runner under an active lease, backing off", {
        sagaId: record.sagaId,
        step: stepName,
      });
      return null;
    }
    try {
      return await this.save({
        ...record,
        currentStep: stepName,
        claimExpiresAt: new Date(Date.now() + this.claimLeaseMs),
        updatedAt: new Date(),
      });
    } catch (err) {
      if (err instanceof SagaConcurrencyError) {
        this.log.warn("Saga step already claimed by another runner, backing off", {
          sagaId: record.sagaId,
          step: stepName,
        });
        return null;
      }
      throw err;
    }
  }

  /** Saves a record of this coordinator's TContext — store.save() is typed generically. */
  private save(record: SagaRecord<TContext>): Promise<SagaRecord<TContext>> {
    return this.store.save(record) as Promise<SagaRecord<TContext>>;
  }
}
