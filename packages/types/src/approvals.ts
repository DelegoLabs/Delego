/** Business-user approvals list types */

export type ApprovalKind =
  | "SPEND_LIMIT_EXCEEDED"
  | "DELEGATION_CREATION"
  | "ESCROW_RELEASE"
  | "ESCROW_REFUND"
  | "DISPUTE_RESOLUTION";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "ESCALATED";

export interface ApprovalItem {
  id: string;
  kind: ApprovalKind;
  status: ApprovalStatus;
  title: string;
  subtitle: string;
  /** Amount in stroops, when applicable */
  amountStroops: bigint | null;
  requesterId: string;
  requesterDisplayName: string | null;
  targetId: string;
  createdAt: Date;
  updatedAt: Date;
  dueAt: Date | null;
  tags: string[];
}

export interface ApprovalListFilters {
  status?: ApprovalStatus | "ALL";
  kind?: ApprovalKind | "ALL";
  search?: string;
}

export interface ApprovalListState {
  items: ApprovalItem[];
  filters: ApprovalListFilters;
  selectedIds: Set<string>;
  focusedIndex: number;
  totalCount: number;
  loading: boolean;
}

export interface ApprovalsBulkActionPayload {
  ids: string[];
  action: "APPROVE" | "REJECT" | "ESCALATE";
  note?: string;
}
