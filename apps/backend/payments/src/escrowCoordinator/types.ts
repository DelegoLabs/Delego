/** Escrow coordinator service contracts */

export interface FundEscrowParams {
  orderId: string;
  buyerAddress: string;
  sellerAddress: string;
  tokenContractId: string;
  amountStroops: string;
  escrowContractId: string;
  timeoutLedgers: number;
}

export interface FundEscrowResult {
  escrowId: string;
  txHash: string;
  ledger: number;
  status: "funded" | "failed";
}

export interface ReleaseEscrowParams {
  escrowId: string;
  escrowContractId: string;
  callerAddress: string;
}

export interface ReleaseResult {
  txHash: string;
  ledger: number;
  status: "released" | "failed";
  sellerAddress: string;
  amount: string;
}

export interface RefundEscrowParams {
  escrowId: string;
  escrowContractId: string;
  callerAddress: string;
  reason: "cancellation" | "dispute_resolution" | "timeout";
}

export interface RefundResult {
  txHash: string;
  ledger: number;
  status: "refunded" | "failed";
  buyerAddress: string;
  amount: string;
}

export interface EscrowStatusResult {
  escrowId: string;
  buyer: string;
  seller: string;
  amount: string;
  status: "funded" | "released" | "refunded" | "disputed";
  createdAt: number;
}

export interface EscrowCoordinator {
  fundEscrow(params: FundEscrowParams): Promise<FundEscrowResult>;
  releaseEscrow(params: ReleaseEscrowParams): Promise<ReleaseResult>;
  refundEscrow(params: RefundEscrowParams): Promise<RefundResult>;
  getEscrowStatus(escrowId: string): Promise<EscrowStatusResult>;
}

export type PaymentRecordStatus =
  | "pending"
  | "funded"
  | "released"
  | "refunded"
  | "failed";

export interface PaymentRecord {
  id: string;
  orderId: string;
  escrowId: string | null;
  escrowContractId: string;
  buyerAddress: string;
  sellerAddress: string;
  tokenContractId: string;
  amountStroops: string;
  status: PaymentRecordStatus;
  fundTxHash: string | null;
  releaseTxHash: string | null;
  refundTxHash: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentRecordInput {
  orderId: string;
  escrowContractId: string;
  buyerAddress: string;
  sellerAddress: string;
  tokenContractId: string;
  amountStroops: string;
}
