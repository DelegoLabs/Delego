import type { Escrow } from "@delegolabs/types";

export type Dispute = any;
export type DisputeReason = string;
export type DisputeStatus = string;

/**
 * Dispute helpers shared by the "Open dispute" CTA, modal, and detail panel.
 */

export const DISPUTE_REASON_OPTIONS: ReadonlyArray<{ value: DisputeReason; label: string }> = [
  { value: "item_not_received", label: "Item not received" },
  { value: "not_as_described", label: "Item not as described" },
  { value: "other", label: "Other" },
];

export function disputeReasonLabel(reason: DisputeReason): string {
  return DISPUTE_REASON_OPTIONS.find((option) => option.value === reason)?.label ?? reason;
}

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  open: "Open",
  under_review: "Under review",
  resolved_buyer: "Resolved — buyer",
  resolved_seller: "Resolved — seller",
  resolved_split: "Resolved — split",
};

/** Dispute statuses that represent a closed/resolved case. */
export const RESOLVED_DISPUTE_STATUSES: ReadonlySet<DisputeStatus> = new Set([
  "resolved_buyer",
  "resolved_seller",
  "resolved_split",
]);

export function isDisputeResolved(status: DisputeStatus): boolean {
  return RESOLVED_DISPUTE_STATUSES.has(status);
}

/** Escrow states from which opening a new dispute makes sense (funds are locked, not yet released/refunded). */
const DISPUTABLE_ESCROW_STATUSES: ReadonlySet<Escrow["status"]> = new Set(["Funded"]);

/**
 * Guard rail: the "Open dispute" CTA only shows for escrows still holding
 * funds, that aren't already terminal, and that don't already have an open
 * (unresolved) dispute — one open dispute per escrow.
 */
export function canOpenDispute(
  escrow: Pick<Escrow, "status">,
  existingDispute: Pick<Dispute, "status"> | null | undefined,
  optimisticallyDisputed = false
): boolean {
  if (!DISPUTABLE_ESCROW_STATUSES.has(escrow.status)) return false;
  if (optimisticallyDisputed) return false;
  if (existingDispute && !isDisputeResolved(existingDispute.status)) return false;
  return true;
}

export const MAX_EVIDENCE_URLS = 5;
