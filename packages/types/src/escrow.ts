/** Escrow fee transparency and on-chain release eligibility */

export type EscrowStatus = "active" | "released" | "refunded" | "disputed";

export interface EscrowTreasurySplit {
  name: string;
  address: string;
  /** Share of the fee this treasury receives, in basis points (1/100 of a percent) */
  splitBasisPoints: number;
  amountStroops: bigint;
}

export interface EscrowFeeBreakdown {
  /** Amount before fees, in stroops */
  grossStroops: bigint;
  /** Fee amount in stroops. Null when fee configuration is unavailable. */
  feeStroops: bigint | null;
  /** Static fee rate in basis points. Null when the fee is dynamic (estimated) rather than fixed. */
  feeBasisPoints: number | null;
  /** True when feeStroops was estimated rather than derived from a static, guaranteed rate */
  isEstimated: boolean;
  /** Amount the seller actually receives, in stroops. Null when fee configuration is unavailable. */
  netStroops: bigint | null;
  treasuries: EscrowTreasurySplit[];
}

export interface EscrowDetail {
  escrowId: string;
  orderId: string | null;
  buyer: string;
  seller: string;
  token: string;
  status: EscrowStatus;
  /** ISO 8601 — the buyer's refund-eligibility unlock time, per the contract's timeout gate on refund() */
  unlockTime: string;
  fees: EscrowFeeBreakdown;
}

export type ReleaseIneligibilityReason =
  | "unauthorized_caller"
  | "already_released"
  | "invalid_status";

export interface ReleaseEligibility {
  escrowId: string;
  eligible: boolean;
  status: EscrowStatus;
  isAuthorizedCaller: boolean;
  reasons: ReleaseIneligibilityReason[];
  /**
   * Informational only. The contract's release() has no timeout gate today —
   * only refund() is gated by unlockTime — but the release CTA still surfaces
   * this so a user isn't confused about why a companion refund is/isn't available.
   */
  buyerRefundUnlockTime: string;
  buyerRefundSecondsRemaining: number;
  /** ISO 8601 — when this eligibility snapshot was computed */
  checkedAt: string;
}
