/**
 * Compile-time guard: OrderIssue (pre-dispute "report a problem") and Dispute
 * (formal dispute) must stay structurally and semantically distinct. If either
 * `@ts-expect-error` below stops erroring, the types have been conflated and
 * `tsc --noEmit` will fail on the unused-directive error.
 */
import type { IssueStatus, OrderIssue } from "./order-issue.js";
import type { DisputeStatus, Dispute } from "./dispute.js";

// @ts-expect-error - "under_review" is a DisputeStatus value, not a valid IssueStatus
export const conflationGuardIssueStatus: IssueStatus = "under_review";

// @ts-expect-error - "escalated" is an IssueStatus value, not a valid DisputeStatus
export const conflationGuardDisputeStatus: DisputeStatus = "escalated";

// @ts-expect-error - an OrderIssue is missing Dispute's required fields (issueId, message: string)
export const conflationGuardAsDispute: Dispute = {} as OrderIssue;

// @ts-expect-error - a Dispute is missing OrderIssue's required fields (reporterUserId, photoUrl, resolvedAt)
export const conflationGuardAsIssue: OrderIssue = {} as Dispute;
