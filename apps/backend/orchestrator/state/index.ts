/** Workflow state machine and types (issue #7). */

export { PurchaseWorkflowMachine } from "./machine.js";
export type { TransitionHook } from "./machine.js";
export { validateSnapshot, assertValidSnapshot, SNAPSHOT_VERSION } from "./snapshot-validator.js";
export type {
  PurchaseState,
  PurchaseEvent,
  PurchaseContext,
  StateTransitionRecord,
  WorkflowSnapshot,
  SnapshotValidationResult,
} from "./types.js";
