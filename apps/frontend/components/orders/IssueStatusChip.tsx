import { Chip, type ChipTone } from "@delego/ui";
import type { IssueStatus } from "@delego/types";

const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  open: "Issue Open",
  acknowledged: "Issue Acknowledged",
  resolved: "Issue Resolved",
  escalated: "Escalated to Dispute",
};

const ISSUE_STATUS_TONE: Record<IssueStatus, ChipTone> = {
  open: "warning",
  acknowledged: "info",
  resolved: "success",
  escalated: "danger",
};

/** Renders an OrderIssue's status. Never accepts a DisputeStatus — the two are separate types. */
export function IssueStatusChip({ status }: { status: IssueStatus }) {
  return <Chip tone={ISSUE_STATUS_TONE[status]}>{ISSUE_STATUS_LABEL[status]}</Chip>;
}
