/**
 * Issue-ticket domain — lightweight "Report a problem" flow distinct from
 * formal disputes. Issue tickets are low-stakes and routed to
 * merchant/agent channels; they do NOT lock funds or invoke any on-chain
 * action. A formal dispute (EscrowDispute) is a separate, heavier process.
 *
 * ─── State machine ─────────────────────────────────────────────────────────
 *   open  →  resolving  →  resolved
 *   open  →  escalated       (→ formal dispute, carrying context forward)
 *
 * These enums must never overlap with DisputeStatus from @delegolabs/types.
 * Tests assert the distinct enum values directly — see IssueTicket.test.ts.
 */

// ─── Category codes ─────────────────────────────────────────────────────────

export const ISSUE_CATEGORY_CODES = [
  "late_delivery",
  "damaged",
  "not_received",
  "other",
] as const;

export type IssueCategoryCode = (typeof ISSUE_CATEGORY_CODES)[number];

export const ISSUE_CATEGORY_LABELS: Record<IssueCategoryCode, string> = {
  late_delivery: "Late delivery",
  damaged: "Item arrived damaged",
  not_received: "Item not received",
  other: "Other issue",
};

// ─── Status enum ────────────────────────────────────────────────────────────

/**
 * Distinct from DisputeStatus. An open issue ticket renders an "issue open"
 * chip; a formal dispute renders "Disputed". They never share a value so
 * UI and payload logic can use exhaustive checks.
 */
export const ISSUE_STATUSES = [
  "issue_open",
  "issue_resolving",
  "issue_resolved",
  "issue_escalated",
] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  issue_open: "Issue open",
  issue_resolving: "In progress",
  issue_resolved: "Resolved",
  issue_escalated: "Escalated to dispute",
};

/** True once an issue can no longer be acted on by the buyer. */
export function isTerminalIssueStatus(status: IssueStatus): boolean {
  return status === "issue_resolved" || status === "issue_escalated";
}

// ─── Payload types ──────────────────────────────────────────────────────────

/** Submitted to POST /api/v1/orders/:orderId/issues */
export interface ReportProblemPayload {
  orderId: string;
  category: IssueCategoryCode;
  /** Optional free-text message from the buyer. */
  message?: string;
  /** Optional URL to an uploaded photo. */
  photoUrl?: string;
  reportedAt: string; // ISO 8601
}

/** Record returned by the API for a persisted issue ticket. */
export interface IssueTicketRecord {
  id: string;
  orderId: string;
  category: IssueCategoryCode;
  message?: string;
  photoUrl?: string;
  status: IssueStatus;
  reportedAt: Date;
  resolvedAt?: Date;
  /**
   * If this ticket was escalated: the DisputeReason pre-filled in the
   * dispute flow, derived from the issue category.
   */
  escalatedDisputeReason?: string;
}

// ─── Escalation helpers ─────────────────────────────────────────────────────

/**
 * Number of days after which an unresolved issue shows the prominent
 * "Escalate to formal dispute" CTA.
 */
export const ESCALATION_THRESHOLD_DAYS = 3;

/** True when an open issue is old enough to warrant an escalation prompt. */
export function isEscalationDue(
  reportedAt: Date,
  now: Date = new Date(),
  thresholdDays: number = ESCALATION_THRESHOLD_DAYS
): boolean {
  const thresholdMs = thresholdDays * 24 * 3600 * 1000;
  return now.getTime() - reportedAt.getTime() >= thresholdMs;
}

/**
 * Maps an issue category to the closest DisputeReason for pre-filling.
 * Keeps the escalation deep-link pre-populated so the buyer doesn't retype.
 */
export const CATEGORY_TO_DISPUTE_REASON: Record<IssueCategoryCode, string> = {
  late_delivery: "other",
  damaged: "not_as_described",
  not_received: "item_not_received",
  other: "other",
};

/** Builds the URL for the escalation deep-link into the dispute flow. */
export function buildEscalationUrl(
  escrowId: string,
  ticket: Pick<IssueTicketRecord, "category" | "message">
): string {
  const params = new URLSearchParams({
    escrowId,
    reason: CATEGORY_TO_DISPUTE_REASON[ticket.category],
    ...(ticket.message ? { description: ticket.message } : {}),
    _source: "issue_escalation",
  });
  return `/escrows/${escrowId}?${params.toString()}#open-dispute`;
}
