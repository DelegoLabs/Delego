/** A pending action a business user must approve or reject */

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Approval {
  id: string;
  title: string;
  description: string | null;
  amountStroops: bigint | null;
  requestedBy: string;
  status: ApprovalStatus;
  createdAt: Date;
  updatedAt: Date;
}
