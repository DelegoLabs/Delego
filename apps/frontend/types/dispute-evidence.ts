/**
 * Type definitions for dispute evidence comparison feature
 */

export interface DisputeEvidenceBundle {
  disputeId: string;
  buyerStatement: string;
  buyerImages: string[];
  merchantStatement?: string;
  merchantImages?: string[];
  arbitratorVerdict?: string;
  status: "open" | "under_review" | "settled";
}

export interface DisputeResolutionDeadline {
  deadline: string; // ISO timestamp
  label: string;
}
