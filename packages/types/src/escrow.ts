/** Escrow detail, fee, and release-eligibility types */

export interface EscrowOperationResult {
  txHash: string;
  ledger: number;
  success: boolean;
  escrowId?: string;
}

export type EscrowStatus = "ACTIVE" | "RELEASED" | "REFUNDED" | "DISPUTED";

export interface EscrowFeeBreakdownLine {
  treasuryName: string;
  /** Gross amount subject to this fee line (stroops) */
  grossStroops: bigint;
  /** Fee in stroops */
  feeStroops: bigint;
  /** Static percentage if known; null if dynamic/estimated */
  feePercentageBps: number | null;
  /** True when the backend could not compute an exact fee */
  estimated: boolean;
}

export interface EscrowFeeSummary {
  /** Total gross (stroops) */
  grossStroops: bigint;
  /** Sum of all fee lines (stroops) */
  totalFeeStroops: bigint;
  /** Net proceeds to seller after all fees (stroops) */
  netProceedsStroops: bigint;
  /** Per-treasury breakdown — empty when backend returns only a summary */
  lines: EscrowFeeBreakdownLine[];
  /** True if any line is estimated */
  hasEstimates: boolean;
}

export interface EscrowDetail {
  id: string;
  contractId: string;
  buyerAddress: string;
  sellerAddress: string;
  tokenAddress: string;
  amountStroops: bigint;
  status: EscrowStatus;
  unlockTimestamp: string;
  createdAt: Date;
  updatedAt: Date;
  /** Fee summary — may be null if fee config is missing (render "—" instead of 0) */
  fees: EscrowFeeSummary | null;
}

/** Why a release is (in)eligible — returned by contract getter `release_eligibility` */
export interface ReleaseEligibilityCondition {
  key:
    | "status_active_required"
    | "timeout_reached"
    | "buyer_or_admin_required"
    | "already_released";
  met: boolean;
  /** Human-readable explanation, suitable for tooltip/popover */
  message: string;
  /** For time-based conditions, ISO 8601 timestamp when the condition flips true */
  effectiveAt: string | null;
}

export interface ReleaseEligibility {
  eligible: boolean;
  conditions: ReleaseEligibilityCondition[];
  queriedAt: string;
}

export interface ReleaseEscrowWithEligibilityParams {
  sourceAddress: string;
  escrowId: string;
}

export { type EscrowOperationResult };
