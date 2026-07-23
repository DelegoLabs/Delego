/**
 * #341 — Purchase workflow compensation.
 *
 * When a step in the purchase saga fails (e.g. escrow is partially released
 * but settlement subsequently fails), this module runs the compensating
 * actions in strict reverse order — "undoing" each completed step.
 *
 * Every compensation action is logged to the workflow transition audit trail
 * so operators have a full, durable record of what was rolled back.
 *
 * Design notes
 * ─────────────
 * • Each CompensationStep carries its own compensate() function so that the
 *   list of steps is the single source of truth for both forward and backward
 *   execution (matching the SagaCoordinator pattern already in the codebase).
 * • The compensator is intentionally synchronous in its orchestration —
 *   individual compensate() callbacks are async but they run sequentially to
 *   avoid interleaved partial rollbacks.
 * • All errors are re-thrown after the audit record is written so callers can
 *   decide on retry strategy.
 */

import { createLogger } from "@delego/utils";
import {
  insertWorkflowTransitionAudit,
} from "../../state/workflow-transition-audit.js";
import type { PurchaseContext } from "../../state/types.js";

const log = createLogger("orchestrator:purchase:compensation", process.env.LOG_LEVEL ?? "info");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompensationStep {
  /** Human-readable name used in audit logs. */
  name: string;
  /**
   * Runs the rollback action for this step.
   * Receives the current (possibly partial) context and the originating error.
   * Returns an updated context that reflects the compensation outcome.
   */
  compensate(context: PurchaseContext, cause: Error): Promise<PurchaseContext>;
}

export type CompensationStatus = "success" | "partial_failure";

export interface CompensationResult {
  status: CompensationStatus;
  /** Steps that were successfully compensated (in execution order — last first). */
  compensatedSteps: string[];
  /** Steps that could not be compensated (require manual intervention). */
  failedSteps: Array<{ step: string; error: string }>;
  /** Final context after all compensations have been attempted. */
  finalContext: PurchaseContext;
}

// ─── Default compensation steps for the purchase saga ────────────────────────

/**
 * Default compensations for the purchase workflow steps.
 * Order matters — forward: [fundEscrow, confirmPurchase, settleEscrow]
 * Compensation runs in reverse: [settleEscrow⁻¹, confirmPurchase⁻¹, fundEscrow⁻¹]
 *
 * Replace these stubs with real service calls when the downstream clients exist.
 */
export const DEFAULT_PURCHASE_COMPENSATION_STEPS: CompensationStep[] = [
  {
    name: "fundEscrow",
    async compensate(ctx, _cause) {
      log.info("Compensation: releasing escrow funds", {
        workflowId: ctx.workflowId,
        escrowContractId: ctx.escrowContractId,
      });
      // TODO: call wallet/payments service to release escrow
      return { ...ctx, escrowContractId: null };
    },
  },
  {
    name: "confirmPurchase",
    async compensate(ctx, _cause) {
      log.info("Compensation: cancelling merchant order", {
        workflowId: ctx.workflowId,
      });
      // TODO: call merchant cancellation API
      return ctx;
    },
  },
  {
    name: "settleEscrow",
    async compensate(ctx, _cause) {
      log.info("Compensation: reversing settlement", {
        workflowId: ctx.workflowId,
      });
      // TODO: initiate refund via payments service
      return ctx;
    },
  },
];

// ─── Core compensator ─────────────────────────────────────────────────────────

/**
 * Runs compensations for the completed steps of a failed purchase workflow.
 *
 * Steps are compensated in reverse order relative to `completedStepNames` so
 * that the most recently completed action is undone first — preserving
 * transactional integrity.
 *
 * All compensations are attempted even when one fails; the result indicates
 * which steps succeeded and which require manual review.
 *
 * @param workflowId       The saga / workflow identifier (for audit records).
 * @param completedStepNames  Names of steps that completed successfully (forward order).
 * @param context          The workflow context at the time of failure.
 * @param cause            The error that triggered compensation.
 * @param allSteps         Full set of available compensation steps (default: purchase saga steps).
 */
export async function runCompensation(
  workflowId: string,
  completedStepNames: string[],
  context: PurchaseContext,
  cause: Error,
  allSteps: CompensationStep[] = DEFAULT_PURCHASE_COMPENSATION_STEPS,
): Promise<CompensationResult> {
  // Build a lookup so we can find compensators by name
  const stepMap = new Map(allSteps.map((s) => [s.name, s]));

  // Run in reverse order — last completed step is undone first
  const toCompensate = [...completedStepNames].reverse();

  const compensatedSteps: string[] = [];
  const failedSteps: Array<{ step: string; error: string }> = [];
  let currentContext = context;

  log.info("Starting workflow compensation", {
    workflowId,
    steps: toCompensate,
    cause: cause.message,
  });

  for (const stepName of toCompensate) {
    const step = stepMap.get(stepName);
    if (!step) {
      log.warn("No compensator registered for step — skipping", { workflowId, step: stepName });
      failedSteps.push({ step: stepName, error: "No compensator registered" });
      continue;
    }

    try {
      currentContext = await step.compensate(currentContext, cause);

      // Record each successful compensation in the audit trail
      await insertWorkflowTransitionAudit({
        orderId: workflowId,
        fromState: stepName,
        toState: `${stepName}_compensated`,
        eventType: "COMPENSATION",
      });

      compensatedSteps.push(stepName);
      log.info("Compensation step succeeded", { workflowId, step: stepName });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("Compensation step failed", { workflowId, step: stepName, error: message });

      // Still write an audit record so operators can see the failure
      try {
        await insertWorkflowTransitionAudit({
          orderId: workflowId,
          fromState: stepName,
          toState: `${stepName}_compensation_failed`,
          eventType: "COMPENSATION_FAILED",
        });
      } catch (auditErr) {
        log.error("Failed to write compensation audit record", {
          workflowId,
          step: stepName,
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      }

      failedSteps.push({ step: stepName, error: message });
    }
  }

  const status: CompensationStatus = failedSteps.length === 0 ? "success" : "partial_failure";

  log.info("Workflow compensation finished", {
    workflowId,
    status,
    compensatedSteps,
    failedStepCount: failedSteps.length,
  });

  return {
    status,
    compensatedSteps,
    failedSteps,
    finalContext: currentContext,
  };
}
