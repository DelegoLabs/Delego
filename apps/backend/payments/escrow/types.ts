/** Escrow contract interaction types */

/**
 * Fee estimate from Horizon /fee_stats API
 * Contains statistics about transaction fees on the Stellar network
 */
export interface FeeEstimate {
  source: "horizon" | "fallback";
  baseFeeStroops: number;
  recommendedFeeStroops: number;
  percentile: "p50" | "p95" | "p99";
  fetchedAt: string;
}

export interface EscrowOperationResult {
  txHash: string;
  ledger: number;
  success: boolean;
  escrowId?: string;
}

export interface InitializeEscrowParams {
  sourceAddress: string;
  adminAddress: string;
}

export interface DepositEscrowParams {
  sourceAddress: string;
  buyerAddress: string;
  sellerAddress: string;
  orderId?: string;
}

export interface ReleaseEscrowParams {
  sourceAddress: string;
  escrowId: string;
}

export interface RefundEscrowParams {
  sourceAddress: string;
  escrowId: string;
}

export interface EscrowService {
  initialize(params: InitializeEscrowParams): Promise<EscrowOperationResult>;
  deposit(params: DepositEscrowParams): Promise<EscrowOperationResult>;
  release(params: ReleaseEscrowParams): Promise<EscrowOperationResult>;
  refund(params: RefundEscrowParams): Promise<EscrowOperationResult>;
}
