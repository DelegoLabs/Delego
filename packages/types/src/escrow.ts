/**
 * Escrow refund types.
 *
 * `RefundEligibilityReason` mirrors the exact `Symbol` values returned by
 * `get_refund_eligibility` in contracts/escrow/src/lib.rs (issue #173) — keep
 * these in sync with that function's source, not its doc-comment (the two
 * have drifted before).
 */
export type RefundEligibilityReason =
  | "ok"
  | "notfund"
  | "released"
  | "refunded"
  | "cancelled"
  | "unfunded"
  | "disputed"
  | "timeout"
  | "noauth";

export interface RefundEligibility {
  escrowId: string;
  eligible: boolean;
  reason: RefundEligibilityReason;
}

/**
 * Reason a buyer selects when requesting a refund. Mirrors the live,
 * wired vocabulary in apps/backend/payments/escrow/types.ts
 * (`RefundReasonCode`) — NOT the orphaned #203/#204 vocabulary in
 * apps/backend/payments/src/validation.ts, which no route validates against.
 */
export type RefundRequestReasonCode =
  | "timeout"
  | "buyer_cancelled"
  | "merchant_cancelled"
  | "dispute_buyer"
  | "system_error";

export interface RefundRequestInput {
  sourceAddress: string;
  refundReasonCode: RefundRequestReasonCode;
}

export interface RefundRequestResult {
  txHash: string;
  ledger: number;
  success: boolean;
  escrowId?: string;
  refundReasonCode: RefundRequestReasonCode;
}
