/**
 * Lightweight "report a problem" flow on orders.
 * Deliberately separate from the formal Dispute flow (see ./dispute.js) —
 * an OrderIssue never transitions into a Dispute; it can only be escalated
 * into creating a new, linked Dispute.
 */

export type IssueCategory = "late" | "damaged" | "not_received" | "other";

export type IssueStatus = "open" | "acknowledged" | "resolved" | "escalated";

export interface OrderIssue {
  id: string;
  orderId: string;
  reporterUserId: string;
  category: IssueCategory;
  message: string | null;
  photoUrl: string | null;
  status: IssueStatus;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

export interface CreateOrderIssuePayload {
  category: IssueCategory;
  message?: string;
  photoUrl?: string;
}
