/** Escrow contract interaction types */

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

export type RefundReasonCode =
  | 'timeout'
  | 'buyer_cancelled'
  | 'merchant_cancelled'
  | 'dispute_buyer'
  | 'system_error';

export interface RefundEscrowParams {
  sourceAddress: string;
  escrowId: string;
  refundReasonCode: RefundReasonCode;
}


export interface EscrowService {
  initialize(params: InitializeEscrowParams): Promise<EscrowOperationResult>;
  deposit(params: DepositEscrowParams): Promise<EscrowOperationResult>;
  release(params: ReleaseEscrowParams): Promise<EscrowOperationResult>;
  refund(params: RefundEscrowParams): Promise<EscrowOperationResult>;
}
