// Stub @delegolabs/types — replaces the private GitHub Packages dependency
// for local development and CI environments without a GitHub token.
//
// The surface below mirrors how the web app consumes the package: domain
// models (Order, Delegation, Escrow, Dispute, User), request/response
// envelopes, and the zod schemas used by the schema-drift contract tests
// (#627). Amounts are bigint in the domain layer; API inputs carry them as
// string-encoded bigints (see @delegolabs/api-generated for the wire shape).
import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Stroops represented as a string to survive JSON serialisation of BigInt. */
export type Stroops = string;

export interface ErrorBody {
  code: string;
  message: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ErrorBody | null;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export type OrderStatus =
  | "draft"
  | "pending"
  | "pending_approval"
  | "approved"
  | "escrowed"
  | "fulfilled"
  | "settled"
  | "completed"
  | "cancelled"
  | "canceled"
  | "rejected"
  | "disputed"
  | "failed"
  | "awaiting_countersign";

export type RejectionReasonCode =
  | "too_expensive"
  | "wrong_item"
  | "wrong_merchant"
  | "wrong_time"
  | "other";

export interface LineItem {
  productId: string;
  quantity: number;
  /** Optional — some legacy payloads omit the unit price. */
  unitPriceStroops?: bigint;
  name?: string;
}

export interface ApprovalSignature {
  approverId: string;
  approverAddress?: string;
  timestamp: string;
}

export interface DualControlState {
  required: boolean;
  status: "single" | "awaiting_countersign" | "completed";
  delegationOwners?: string[];
  firstApproval?: ApprovalSignature;
  secondApproval?: ApprovalSignature;
}

export interface Order {
  id: string;
  userId?: string;
  delegationId: string;
  merchantId?: string;
  status: OrderStatus;
  totalStroops: bigint;
  /** Optional — legacy views carry items in the `items` alias instead. */
  lineItems?: LineItem[];
  escrowContractId?: string | null;
  rejectionReason?: RejectionReasonCode | null;
  rejectionNote?: string | null;
  approvalNote?: string | null;
  createdAt: Date | string;
  updatedAt?: Date | string;
  expiresAt?: Date | string | null;
  dualControl?: DualControlState;
  /** Optional display enrichment (denormalised merchant name). */
  merchantName?: string;
  /** Legacy alias for totalStroops used by a few older views. */
  amount?: bigint;
  /** Legacy alias for lineItems used by a few older views. */
  items?: LineItem[];
}

// ---------------------------------------------------------------------------
// Delegations
// ---------------------------------------------------------------------------

export type DelegationPermissionLevel =
  | "VIEW_ONLY"
  | "AUTO_APPROVE"
  | "SIGNER"
  | "ADMIN";

export type DelegationStatus =
  | "active"
  | "paused"
  | "revoked"
  | "expired"
  | "pending";

export interface DelegationPolicy {
  /** Stroops as bigint in the domain layer. */
  maxPerTransaction: bigint;
  /** Stroops as bigint in the domain layer. */
  maxTotal: bigint;
  allowedMerchants: string[];
  allowedCategories?: string[];
  /** ISO date string or null when the delegation never expires. */
  expiresAt?: string | null;
}

/** Mirrors the app-local ColorTag union (lib/delegationTags.ts). */
export type DelegationColorTag =
  | "slate"
  | "indigo"
  | "emerald"
  | "amber"
  | "rose"
  | "cyan"
  | "violet"
  | "teal";

export interface Delegation {
  id: string;
  userId: string;
  agentId: string;
  /** Optional while an optimistic in-flight delegation has no wallet yet. */
  walletId?: string;
  label?: string;
  colorTag?: DelegationColorTag;
  status: DelegationStatus;
  permissionLevel?: DelegationPermissionLevel;
  policy: DelegationPolicy;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreateDelegationInput {
  agentId: string;
  walletId: string;
  label: string;
  permissionLevel: DelegationPermissionLevel;
  policy: {
    /** String-encoded bigint on the wire. */
    maxPerTransaction: string;
    /** String-encoded bigint on the wire. */
    maxTotal: string;
    allowedMerchants: string[];
    allowedCategories?: string[];
    expiresAt?: string;
  };
}

export interface UpdateDelegationInput {
  status?: DelegationStatus;
  label?: string;
  permissionLevel?: DelegationPermissionLevel;
  policy?: Partial<
    Pick<DelegationPolicy, "allowedMerchants" | "allowedCategories">
  > & {
    /** String-encoded bigint on the wire. */
    maxPerTransaction?: string;
    /** String-encoded bigint on the wire. */
    maxTotal?: string;
    expiresAt?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Escrows
// ---------------------------------------------------------------------------

/**
 * Escrow lifecycle status. Canonical values come from the contract
 * (capitalised); lowercase/`cancelled` variants appear on API payloads and
 * reconciliation paths (see lib/escrowEligibility.ts, lib/cancelGrace.ts).
 */
export type EscrowStatus =
  | "Funded"
  | "Released"
  | "Refunded"
  | "Disputed"
  | "funded"
  | "released"
  | "refunded"
  | "disputed"
  | "cancelled"
  | "canceled"
  | "cancelling";

/** Status chip metadata consumed by EscrowCard. */
export const ESCROW_STATUS_META: Record<
  string,
  { label: string; tone: "pending" | "success" | "failed" | "refunded" }
> = {
  Funded: { label: "Funded", tone: "pending" },
  Released: { label: "Released", tone: "success" },
  Refunded: { label: "Refunded", tone: "refunded" },
  Disputed: { label: "Disputed", tone: "failed" },
};

/**
 * Server-issued cancellation grace window (#580). All timestamps are ISO
 * strings; `serverTimestamp` lets clients correct for clock skew.
 */
export interface CancellationGrace {
  requestedAt: string;
  graceExpiresAt: string;
  serverTimestamp: string;
  finalizesAt?: string;
  status?: string;
  /** Convenience copy of the window length in seconds. */
  gracePeriodSeconds?: number;
}

export interface Escrow {
  /** Contract escrow identifier. */
  escrowId: string;
  /** Some API payloads expose a surrogate row id. */
  id?: string;
  orderId: string;
  buyer: string;
  seller: string;
  /** Asset id — omitted by some older payloads. */
  token?: string;
  /** Amount as a string-encoded bigint (bigint on freshly-adapted rows). */
  amount: string | bigint;
  status: EscrowStatus;
  /** Ledger-height timeout — omitted on time-based (deadline) escrows. */
  timeoutLedger?: number;
  currentLedger?: number;
  createdAt: string;
  /** Optional enrichment fields surfaced by newer gateway payloads. */
  buyerId?: string;
  sellerId?: string;
  arbiter?: string | null;
  /** ISO deadline including granted extensions. */
  deadline?: string | null;
  /** ISO deadline before any extension was granted. */
  originalDeadline?: string | null;
  extensionsConsumed?: number;
  maxExtensions?: number;
  maxExtensionSeconds?: number;
  cancellation?: CancellationGrace | null;
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

export type DisputeReason = string;

export type DisputeStatus = string;

export interface Dispute {
  id: string;
  escrowId: string;
  orderId: string;
  reason: DisputeReason;
  description?: string | null;
  evidenceUrls: string[];
  status: DisputeStatus;
  arbiter?: string | null;
  openedBy?: string;
  resolutionNote?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
}

export interface CreateDisputeInput {
  /** Attached by the caller (useDispute) when not supplied by the form. */
  escrowId?: string;
  reason: DisputeReason;
  description?: string;
  evidenceUrls?: string[];
}

// ---------------------------------------------------------------------------
// Data erasure (#610)
// ---------------------------------------------------------------------------

export interface ErasureRequest {
  requestedAt: string;
  finalizesAt: string;
  serverTimestamp: string;
  status: "pending" | "cancelled" | "finalized";
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export type ContractName = "escrow" | "permissions" | "registry";

export interface ContractVersionInfo {
  name: ContractName;
  version: string;
}

// ---------------------------------------------------------------------------
// Users & preferences
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  stellarAddress: string;
  displayName?: string;
  email?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface UserPreferences {
  userId: string;
  currency: string;
  theme: "light" | "dark" | "system";
  notificationsEnabled: boolean;
  /** Stroops as bigint in the domain layer. */
  defaultSpendingLimit: bigint;
  requireApproval: boolean;
  notificationEmail: boolean;
  notificationPush: boolean;
}

// ---------------------------------------------------------------------------
// Zod schemas — schema-drift contract tests (#627)
// ---------------------------------------------------------------------------
// These validate the mock fixtures against the domain shapes. Fixtures carry
// bigint amounts (unserialisable for plain z.json), so numeric fields use
// permissive custom checks; the drift tests are about *shape*, not encoding.

const bigintLike = z.custom<bigint>(
  (v) => typeof v === "bigint" || typeof v === "number" || typeof v === "string"
);

const dateLike = z.custom<Date | string>(
  (v) => v instanceof Date || typeof v === "string"
);

export const LineItemSchema = z.object({
  productId: z.string(),
  quantity: z.number(),
  unitPriceStroops: bigintLike.optional(),
  name: z.string().optional(),
});

export const OrderSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  delegationId: z.string(),
  merchantId: z.string().optional(),
  status: z.string(),
  totalStroops: bigintLike,
  lineItems: z.array(LineItemSchema),
  escrowContractId: z.string().nullable(),
  rejectionReason: z.string().nullable().optional(),
  rejectionNote: z.string().nullable().optional(),
  approvalNote: z.string().nullable().optional(),
  createdAt: dateLike,
  updatedAt: dateLike,
  expiresAt: dateLike.nullable().optional(),
  dualControl: z.any().optional(),
  merchantName: z.string().optional(),
  amount: bigintLike.optional(),
  items: z.array(LineItemSchema).optional(),
});

export const DelegationPolicySchema = z.object({
  maxPerTransaction: bigintLike,
  maxTotal: bigintLike,
  allowedMerchants: z.array(z.string()),
  allowedCategories: z.array(z.string()).optional(),
  expiresAt: z.string().nullable().optional(),
});

export const DelegationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  agentId: z.string(),
  walletId: z.string(),
  label: z.string().optional(),
  colorTag: z.string().optional(),
  status: z.string(),
  permissionLevel: z.string(),
  policy: DelegationPolicySchema,
  createdAt: dateLike,
  updatedAt: dateLike,
});

export const CancellationGraceSchema = z.object({
  requestedAt: z.string(),
  graceExpiresAt: z.string(),
  serverTimestamp: z.string(),
  finalizesAt: z.string().optional(),
  status: z.string().optional(),
});

export const EscrowSchema = z.object({
  escrowId: z.string(),
  id: z.string().optional(),
  orderId: z.string(),
  buyer: z.string(),
  seller: z.string(),
  token: z.string(),
  amount: bigintLike,
  status: z.string(),
  timeoutLedger: z.number(),
  currentLedger: z.number().optional(),
  createdAt: z.string(),
  buyerId: z.string().optional(),
  sellerId: z.string().optional(),
  arbiter: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  originalDeadline: z.string().nullable().optional(),
  extensionsConsumed: z.number().optional(),
  maxExtensions: z.number().optional(),
  maxExtensionSeconds: z.number().optional(),
  cancellation: CancellationGraceSchema.nullable().optional(),
});
