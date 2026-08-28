import { Chip, type ChipTone } from "@delego/ui";
import type { DisputeStatus } from "@delego/types";

const DISPUTE_STATUS_LABEL: Record<DisputeStatus, string> = {
  open: "Dispute Open",
  under_review: "Under Review",
  resolved: "Dispute Resolved",
  closed: "Dispute Closed",
};

const DISPUTE_STATUS_TONE: Record<DisputeStatus, ChipTone> = {
  open: "warning",
  under_review: "info",
  resolved: "success",
  closed: "neutral",
};

/** Renders a Dispute's status. Never accepts an IssueStatus — the two are separate types. */
export function DisputeStatusChip({ status }: { status: DisputeStatus }) {
  return <Chip tone={DISPUTE_STATUS_TONE[status]}>{DISPUTE_STATUS_LABEL[status]}</Chip>;
}
