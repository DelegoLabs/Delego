/**
 * Formal dispute flow. Kept separate from OrderIssue (see ./order-issue.js) —
 * a Dispute may originate from an escalated OrderIssue (via `issueId`) but is
 * a distinct record with its own status lifecycle.
 */
import type { IssueCategory } from "./order-issue.js";

export type DisputeStatus = "open" | "under_review" | "resolved" | "closed";

export interface Dispute {
  id: string;
  orderId: string;
  /** The OrderIssue this dispute was escalated from, if any */
  issueId: string | null;
  category: IssueCategory;
  message: string;
  status: DisputeStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDisputePayload {
  category: IssueCategory;
  message: string;
  issueId?: string;
}
