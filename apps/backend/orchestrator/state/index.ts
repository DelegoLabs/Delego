/** Workflow state machine and types (issue #7). */

export { PurchaseWorkflowMachine } from "./machine.js";
export type { TransitionHook } from "./machine.js";
export type {
  PurchaseState,
  PurchaseEvent,
  PurchaseContext,
  StateTransitionRecord,
  WorkflowSnapshot,
} from "./types.js";
