/** Commerce order lifecycle */

export type OrderStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "escrowed"
  | "fulfilled"
  | "settled"
  | "cancelled"
  | "disputed";

export interface OrderLineItem {
  productId: string;
  quantity: number;
  unitPriceStroops: bigint;
}

export interface Order {
  id: string;
  userId: string;
  delegationId: string;
  merchantId: string;
  status: OrderStatus;
  lineItems: OrderLineItem[];
  totalStroops: bigint;
  escrowContractId: string | null;
  /** Numeric on-chain escrow id (Soroban `u64`) within escrowContractId, if escrowed. */
  escrowId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
