import type { Order, OrderStatus } from "@delegolabs/types";
import { formatXlm, needsApproval } from "./orders";

/**
 * SLA thresholds for the approval queue. Hours are measured against an
 * order's `createdAt` (stored/compared as UTC epoch millis, so these hold
 * regardless of the viewer's local timezone or clock skew of the *reader* —
 * only the server-issued `createdAt` needs to be correct).
 */
export const SLA_WARNING_HOURS = 12;
export const SLA_CRITICAL_HOURS = 48;

/** Threshold for the "waiting too long" digest hint surfaced in the notification center. */
export const STALE_DIGEST_THRESHOLD_HOURS = 24;

const MS_PER_HOUR = 3_600_000;

export type ApprovalUrgency = "normal" | "warning" | "critical";

/** Milliseconds elapsed since `createdAt`, floored at zero. */
export function getApprovalAgeMs(
  createdAt: Date,
  now: Date = new Date()
): number {
  return Math.max(0, now.getTime() - createdAt.getTime());
}

/** Compact age label for a badge: "just now", "42m", "2h", "3d". */
export function formatApprovalAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Urgency bucket for an age, used to drive amber/red styling thresholds. */
export function getApprovalUrgency(
  ageMs: number,
  warningHours: number = SLA_WARNING_HOURS,
  criticalHours: number = SLA_CRITICAL_HOURS
): ApprovalUrgency {
  const hours = ageMs / MS_PER_HOUR;
  if (hours >= criticalHours) return "critical";
  if (hours >= warningHours) return "warning";
  return "normal";
}

/** Count pending-approval orders older than `thresholdHours`, for the digest hint. */
export function countStaleApprovals(
  orders: Order[],
  now: Date = new Date(),
  thresholdHours: number = STALE_DIGEST_THRESHOLD_HOURS
): number {
  const thresholdMs = thresholdHours * MS_PER_HOUR;
  return orders.filter(
    (order) =>
      needsApproval(order) &&
      getApprovalAgeMs(order.createdAt, now) >= thresholdMs
  ).length;
}

/* ---------------------------------------------------------------------------
 * Approval history (#568)
 *
 * Once an approval is acted on it drops out of the inbox, leaving users with
 * no record for self-audit or expense reconciliation. There is no dedicated
 * "decisions" API — a decision is just an order that has moved past
 * `pending_approval` — so the history is *derived* from the order list here
 * (same principle as lib/export.ts's `decisionForOrder`, kept in this module
 * because it centralizes approval decision logic).
 * ------------------------------------------------------------------------- */

export type ApprovalDecisionType = "approved" | "rejected";

/** Order statuses that mean the approval was granted. */
const APPROVED_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "approved",
  "escrowed",
  "fulfilled",
  "settled",
  "completed",
]);

/** Order statuses that mean the approval was denied or the order fell over post-decision. */
const REJECTED_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "rejected",
  "canceled",
  "cancelled",
  "disputed",
  "failed",
]);

/** One decided approval, flattened for the history table and CSV export. */
export interface ApprovalDecisionRecord {
  orderId: string;
  /** Short human label for what was ordered (line item, or merchant as fallback). */
  item: string;
  merchantId: string;
  amountStroops: bigint;
  decision: ApprovalDecisionType;
  /** Rejection reason when present; `null` for approvals or unspecified rejections. */
  reason: string | null;
  /** When the decision was made — best available is the order's `updatedAt`. */
  decidedAt: Date;
  delegationId: string;
  /** Resolved agent for the delegation when a lookup is supplied, else `null`. */
  agentId: string | null;
}

/** Maps an order status to a decision type, or `null` if no decision has been made yet. */
export function decisionTypeForStatus(
  status: OrderStatus
): ApprovalDecisionType | null {
  if (APPROVED_STATUSES.has(status)) return "approved";
  if (REJECTED_STATUSES.has(status)) return "rejected";
  // draft / pending / pending_approval / awaiting_countersign — still open.
  return null;
}

interface OrderLineItemLike {
  productId?: string;
  name?: string;
  quantity?: number;
}

/** "product-x2 +1 more" style summary; falls back to the merchant id. */
function summarizeItem(order: Order): string {
  const items = (order.lineItems ?? []) as OrderLineItemLike[];
  const first = items[0];
  if (!first) return order.merchantId ?? order.id;
  const label = first.name ?? first.productId ?? order.merchantId ?? order.id;
  const qty = first.quantity && first.quantity > 1 ? `×${first.quantity}` : "";
  const more = items.length > 1 ? ` +${items.length - 1} more` : "";
  return `${label}${qty}${more}`;
}

export interface DeriveApprovalDecisionsOptions {
  /** delegationId → agentId, e.g. from `useDelegations()`, to populate `agentId`. */
  agentByDelegationId?: ReadonlyMap<string, string>;
}

/**
 * Derives the list of decided approvals from an order list, newest decision
 * first. Orders still awaiting a decision are skipped.
 */
export function deriveApprovalDecisions(
  orders: Order[],
  options: DeriveApprovalDecisionsOptions = {}
): ApprovalDecisionRecord[] {
  const { agentByDelegationId } = options;
  const records: ApprovalDecisionRecord[] = [];

  for (const order of orders) {
    const decision = decisionTypeForStatus(order.status);
    if (decision === null) continue;

    const delegationId = order.delegationId;
    records.push({
      orderId: order.id,
      item: summarizeItem(order),
      merchantId: order.merchantId ?? "",
      amountStroops: BigInt(order.totalStroops ?? 0n),
      decision,
      reason:
        decision === "rejected" ? (order.rejectionReason ?? null) : null,
      decidedAt: new Date(order.updatedAt ?? order.createdAt),
      delegationId,
      agentId: agentByDelegationId?.get(delegationId) ?? null,
    });
  }

  return records.sort(
    (a, b) => b.decidedAt.getTime() - a.decidedAt.getTime()
  );
}

/** Composable filter set for the history view — every provided field is ANDed. */
export interface ApprovalHistoryFilters {
  /** Inclusive lower bound on `decidedAt`. */
  from?: Date | null;
  /** Inclusive upper bound on `decidedAt`. */
  to?: Date | null;
  decision?: ApprovalDecisionType | null;
  agentId?: string | null;
  delegationId?: string | null;
}

/** Applies `filters` to a decision list (AND-composed), preserving input order. */
export function filterApprovalDecisions(
  records: ApprovalDecisionRecord[],
  filters: ApprovalHistoryFilters
): ApprovalDecisionRecord[] {
  const fromMs = filters.from ? filters.from.getTime() : null;
  const toMs = filters.to ? filters.to.getTime() : null;

  return records.filter((record) => {
    const decidedMs = record.decidedAt.getTime();
    if (fromMs !== null && decidedMs < fromMs) return false;
    if (toMs !== null && decidedMs > toMs) return false;
    if (filters.decision && record.decision !== filters.decision) return false;
    if (filters.agentId && record.agentId !== filters.agentId) return false;
    if (
      filters.delegationId &&
      record.delegationId !== filters.delegationId
    ) {
      return false;
    }
    return true;
  });
}

/** True when no filter narrows the result — used to pick the right empty state. */
export function hasActiveHistoryFilters(
  filters: ApprovalHistoryFilters
): boolean {
  return Boolean(
    filters.from ||
      filters.to ||
      filters.decision ||
      filters.agentId ||
      filters.delegationId
  );
}

/** Distinct, sorted agent ids present in a decision list (for the filter dropdown). */
export function uniqueAgentIds(records: ApprovalDecisionRecord[]): string[] {
  return [
    ...new Set(
      records
        .map((r) => r.agentId)
        .filter((id): id is string => Boolean(id))
    ),
  ].sort();
}

/** Distinct, sorted delegation ids present in a decision list. */
export function uniqueDelegationIds(
  records: ApprovalDecisionRecord[]
): string[] {
  return [...new Set(records.map((r) => r.delegationId))].sort();
}

/**
 * Stable CSV column schema for the decisions export. Documented here so a
 * consumer building against the file (a spreadsheet, a script) has one place
 * to check. Distinct from the orders/spending export in
 * hooks/useBuiltinCommands.ts — that one is keyed on order lifecycle, this
 * one on the approve/reject decision.
 *
 *   | Column              | Source                                   |
 *   |---------------------|------------------------------------------|
 *   | Order ID            | order.id                                 |
 *   | Item                | first line item (or merchant fallback)   |
 *   | Merchant            | order.merchantId                         |
 *   | Amount (XLM)        | order.totalStroops, formatted            |
 *   | Decision            | "approved" | "rejected"                  |
 *   | Reason              | order.rejectionReason (rejections only)  |
 *   | Decided At          | order.updatedAt, ISO 8601 UTC            |
 *   | Agent               | delegation.agentId (resolved) or ""      |
 *   | Delegation          | order.delegationId                       |
 */
export const APPROVAL_DECISIONS_CSV_HEADER = [
  "Order ID",
  "Item",
  "Merchant",
  "Amount (XLM)",
  "Decision",
  "Reason",
  "Decided At",
  "Agent",
  "Delegation",
] as const;

/** Serializes decision records to header + string rows for `toCsv` (lib/csv.ts). */
export function approvalDecisionsToCsv(records: ApprovalDecisionRecord[]): {
  header: string[];
  rows: string[][];
} {
  const rows = records.map((record) => [
    record.orderId,
    record.item,
    record.merchantId,
    formatXlm(record.amountStroops),
    record.decision,
    record.reason ?? "",
    record.decidedAt.toISOString(),
    record.agentId ?? "",
    record.delegationId,
  ]);
  return { header: [...APPROVAL_DECISIONS_CSV_HEADER], rows };
}
