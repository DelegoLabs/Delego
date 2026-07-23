/** Core state types for the purchase workflow machine (issue #7). */

export type PurchaseState =
  | "Discovery"
  | "SpendingCheck"
  | "UserApprovalPending"
  | "EscrowLocking"
  | "MerchantFulfillment"
  | "DeliveryVerification"
  | "Completed"
  | "Refunded";

export type PurchaseEvent =
  | { type: "PRODUCT_FOUND"; productId: string; merchantId: string; totalStroops: bigint }
  | { type: "SPEND_APPROVED" }
  | { type: "SPEND_DENIED"; reason: string }
  | { type: "USER_APPROVED" }
  | { type: "USER_REJECTED" }
  | { type: "ESCROW_LOCKED"; escrowContractId: string }
  | { type: "ESCROW_FAILED"; reason: string }
  | { type: "FULFILLMENT_CONFIRMED" }
  | { type: "DELIVERY_VERIFIED" }
  | { type: "REFUND_INITIATED"; reason: string };

export interface PurchaseContext {
  workflowId: string;
  delegationId: string;
  userId: string;
  productId: string | null;
  merchantId: string | null;
  totalStroops: bigint | null;
  escrowContractId: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StateTransitionRecord {
  workflowId: string;
  fromState: PurchaseState | null;
  toState: PurchaseState;
  event: string;
  context: PurchaseContext;
  timestamp: Date;
}

export interface WorkflowSnapshot {
  workflowId: string;
  currentState: PurchaseState;
  context: PurchaseContext;
  history: StateTransitionRecord[];
  version: number;
  /**
   * #347 — Optional absolute deadline for this workflow.
   * When set, the timeout checker (workflows/timeout.ts) will treat the
   * workflow as stuck once `Date.now() > timeoutAt.getTime()` — even if
   * `updatedAt` is recent (e.g. a lease keep-alive is refreshing it).
   *
   * Set this during workflow creation to a reasonable wall-clock deadline
   * (e.g. `new Date(Date.now() + 30 * 60 * 1000)` for 30 minutes).
   * Leave it `undefined` to fall back to the inactivity-based detection
   * already implemented in `findStuckWorkflows`.
   */
  timeoutAt?: Date;
}

export interface SnapshotValidationResult {
  valid: boolean;
  errors: string[];
}
