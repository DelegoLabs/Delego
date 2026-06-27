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
}

export interface SnapshotValidationResult {
  valid: boolean;
  errors: string[];
}
