/** Escrow lifecycle — matches Soroban EscrowStatus enum */

export type EscrowStatus = "Funded" | "Released" | "Refunded" | "Disputed";

export interface Escrow {
  /** Numeric escrow identifier assigned by the contract */
  escrowId: string;
  /** Stellar address of the buyer */
  buyer: string;
  /** Stellar address of the seller / merchant */
  seller: string;
  /** Token contract address used for the deposit */
  token: string;
  /** Amount locked in stroops (serialised as string for JSON safety) */
  amount: string;
  /** On-chain escrow status */
  status: EscrowStatus;
  /** Order identifier the escrow is linked to */
  orderId: string;
  /** ISO-8601 timestamp when the escrow was created */
  createdAt: string;
  /** Absolute ledger number when the buyer may request a refund */
  timeoutLedger: number;
  /** Current ledger number (provided by backend for countdown calculation) */
  currentLedger?: number;
}

/** Labels and colour keys for EscrowStatus badges */
export const ESCROW_STATUS_META: Record<
  EscrowStatus,
  { label: string; color: string; bg: string }
> = {
  Funded: {
    label: "Funded",
    color: "#065f46",
    bg: "#d1fae5",
  },
  Released: {
    label: "Released",
    color: "#1e40af",
    bg: "#dbeafe",
  },
  Refunded: {
    label: "Refunded",
    color: "#92400e",
    bg: "#fef3c7",
  },
  Disputed: {
    label: "Disputed",
    color: "#991b1b",
    bg: "#fee2e2",
  },
};
