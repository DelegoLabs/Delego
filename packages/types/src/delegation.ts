/** A delegation grants an AI agent scoped authority to act on behalf of a user */

export type DelegationStatus =
  | "pending"
  | "active"
  | "paused"
  | "revoked"
  | "expired";

export interface SpendingPolicy {
  /** Max per-transaction amount in stroops */
  maxPerTransaction: bigint;
  /** Max cumulative spend in stroops for this delegation */
  maxTotal: bigint;
  /** Allowed merchant IDs; empty = all */
  allowedMerchants: string[];
  /** ISO 8601 expiry */
  expiresAt: string | null;
}

export interface Delegation {
  id: string;
  userId: string;
  agentId: string;
  status: DelegationStatus;
  policy: SpendingPolicy;
  createdAt: Date;
  updatedAt: Date;
}

export type DelegationPermissionLevel =
  | "VIEW_ONLY"
  | "AUTO_APPROVE"
  | "SIGNER"
  | "ADMIN";

export interface CreateDelegationPolicyInput {
  /** Max per-transaction amount in stroops, as a numeric string */
  maxPerTransaction: string;
  /** Max cumulative spend in stroops, as a numeric string */
  maxTotal: string;
  allowedMerchants: string[];
  allowedCategories: string[];
  /** ISO 8601 expiry */
  expiresAt?: string;
}

export interface CreateDelegationInput {
  agentId: string;
  walletId: string;
  label: string;
  policy: CreateDelegationPolicyInput;
  permissionLevel: DelegationPermissionLevel;
}

export interface UpdateDelegationPolicyInput {
  maxPerTransaction?: string;
  maxTotal?: string;
  allowedMerchants?: string[];
  allowedCategories?: string[];
  expiresAt?: string;
}

export interface UpdateDelegationInput {
  status?: DelegationStatus;
  policy?: UpdateDelegationPolicyInput;
}
