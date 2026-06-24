export type PaymentStatus =
  | "pending"
  | "funded"
  | "released"
  | "refunded"
  | "disputed"
  | "failed";

const CONTRACT_STATUS_MAP: Record<string, PaymentStatus> = {
  initialized: "pending",
  pending: "pending",
  funded: "funded",
  deposited: "funded",
  released: "released",
  completed: "released",
  refunded: "refunded",
  cancelled: "refunded",
  disputed: "disputed",
  in_dispute: "disputed",
  failed: "failed",
  error: "failed",
  expired: "failed",
};

export function mapContractStatusToPaymentStatus(
  contractStatus: string
): PaymentStatus {
  const normalized = contractStatus.toLowerCase().trim();
  return CONTRACT_STATUS_MAP[normalized] ?? "failed";
}
