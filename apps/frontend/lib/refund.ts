/**
 * Refund domain helpers — reason codes, payload types, timeline steps, and
 * formatting utilities. Kept side-effect free so they can be unit-tested and
 * shared across the refund CTA, timeline, and payments-service coordination.
 */

import { formatXlm } from "./orders";

// ─── Reason codes ────────────────────────────────────────────────────────────

/**
 * Machine-readable reason codes agreed between the frontend and the payments
 * service. Add new values here and in the payments-service enum together.
 */
export const REFUND_REASON_CODES = [
  "item_not_received",
  "item_not_as_described",
  "duplicate_charge",
  "merchant_cancelled",
  "quality_issue",
  "unauthorized_charge",
  "other",
] as const;

export type RefundReasonCode = (typeof REFUND_REASON_CODES)[number];

/** Human-readable label for a reason code. */
export const REFUND_REASON_LABELS: Record<RefundReasonCode, string> = {
  item_not_received: "Item not received",
  item_not_as_described: "Item not as described",
  duplicate_charge: "Duplicate charge",
  merchant_cancelled: "Merchant cancelled",
  quality_issue: "Quality issue",
  unauthorized_charge: "Unauthorised charge",
  other: "Other",
};

// ─── Eligibility reason codes from the contract ──────────────────────────────

/**
 * Reason symbols returned by the escrow contract's `get_refund_eligibility`
 * getter. Keep in sync with the Rust `symbol_short!` values in lib.rs.
 */
export type EligibilityReason =
  | "ok"
  | "timeout"
  | "released"
  | "refunded"
  | "disputed"
  | "cancelled"
  | "notfund"
  | "unfunded"
  | "noauth";

/** Human-readable explanation for why a refund is not yet eligible. */
export const ELIGIBILITY_NOT_YET_LABELS: Partial<
  Record<EligibilityReason, string>
> = {
  timeout:
    "The refund window hasn't opened yet. You can request a refund after the escrow timeout.",
  released: "These funds have already been released to the merchant.",
  refunded: "This escrow has already been refunded.",
  disputed: "This escrow is under dispute — refunds are paused.",
  cancelled: "This order was cancelled.",
  unfunded: "This escrow hasn't been funded yet.",
  noauth: "You are not authorised to request a refund for this escrow.",
  notfund: "Escrow not found.",
};

// ─── Refund lifecycle ─────────────────────────────────────────────────────────

export type RefundStatus =
  | "requested"
  | "pending_review"
  | "approved"
  | "rejected"
  | "settled";

export const REFUND_LIFECYCLE: readonly RefundStatus[] = [
  "requested",
  "pending_review",
  "approved",
  "settled",
] as const;

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  requested: "Requested",
  pending_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  settled: "Settled",
};

/** Zero-based index of a status in the happy-path lifecycle, -1 for rejected. */
export function refundLifecycleIndex(status: RefundStatus): number {
  return REFUND_LIFECYCLE.indexOf(status);
}

// ─── Payload types for the payments service ──────────────────────────────────

/**
 * Payload sent to `POST /api/v1/refunds` (or the payments-service equivalent).
 * Typed here so both the UI and the payments service can import a single
 * source of truth before the endpoint is wired.
 */
export interface RefundRequestPayload {
  /** Numeric escrow identifier from the contract. */
  escrowId: string;
  /** Order ID correlating this refund to the order record. */
  orderId: string;
  /**
   * Requested refund amount in stroops. Null means "full remaining balance"
   * and the service will calculate the exact amount server-side.
   */
  amountStroops: string | null;
  /** Machine-readable reason code. */
  reasonCode: RefundReasonCode;
  /** Optional free-text from the buyer (evidence URLs, notes). */
  evidenceNote?: string;
  /** ISO 8601 timestamp of when the user submitted the request. */
  requestedAt: string;
}

/**
 * A refund record as returned by the payments service (used to drive the
 * timeline and status display after submission).
 */
export interface RefundRecord {
  id: string;
  escrowId: string;
  orderId: string;
  amountStroops: bigint | null;
  reasonCode: RefundReasonCode;
  evidenceNote?: string;
  status: RefundStatus;
  requestedAt: Date;
  resolvedAt?: Date;
  rejectionReason?: string;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Format a nullable refund amount, falling back to "Full balance". */
export function formatRefundAmount(
  amountStroops: bigint | null | undefined
): string {
  if (amountStroops == null) return "Full balance";
  return `${formatXlm(amountStroops)} XLM`;
}

/** True when a refund has reached a terminal state (no further actions possible). */
export function isTerminalRefundStatus(status: RefundStatus): boolean {
  return status === "settled" || status === "rejected";
}
