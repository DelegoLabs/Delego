/** Commerce order lifecycle */

export type OrderStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "escrowed"
  | "fulfilled"
  | "settled"
  | "cancelled"
  | "disputed";

export interface OrderLineItem {
  productId: string;
  quantity: number;
  unitPriceStroops: bigint;
}

export interface Order {
  id: string;
  userId: string;
  delegationId: string;
  merchantId: string;
  status: OrderStatus;
  lineItems: OrderLineItem[];
  totalStroops: bigint;
  escrowContractId: string | null;
  createdAt: Date;
  updatedAt: Date;
  issue?: OrderIssue | null;
  dispute?: OrderDispute | null;
}

/** Lightweight pre-dispute issue — strictly separate from formal Dispute */
export type IssueCategory = "late" | "damaged" | "not_received" | "other";
export type IssueStatus = "OPEN" | "RESOLVED" | "ESCALATED";

export interface OrderIssue {
  id: string;
  orderId: string;
  category: IssueCategory;
  message: string | null;
  photoUrl: string | null;
  status: IssueStatus;
  reportedBy: string;
  reportedAt: Date;
  resolvedAt: Date | null;
  escalatedAt: Date | null;
  escalationDays: number;
}

/** Formal dispute — kept distinct from Issue at the type level */
export type DisputeCategory = "late" | "damaged" | "not_received" | "fraud" | "other";
export type DisputeStatus =
  | "OPEN"
  | "EVIDENCE_PENDING"
  | "UNDER_REVIEW"
  | "RESOLVED_SELLER"
  | "RESOLVED_BUYER"
  | "DISMISSED";

export interface OrderDispute {
  id: string;
  orderId: string;
  escrowId: string;
  category: DisputeCategory;
  message: string;
  evidenceUrls: string[];
  status: DisputeStatus;
  raisedBy: string;
  raisedAt: Date;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  escalatedFromIssueId: string | null;
}

export interface ReportOrderIssuePayload {
  orderId: string;
  category: IssueCategory;
  message?: string;
  photoUrl?: string;
}

export interface EscalateIssueToDisputePayload {
  issueId: string;
  orderId: string;
  escrowId: string;
  additionalEvidenceUrls?: string[];
  additionalNotes?: string;
}
