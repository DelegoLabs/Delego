export type DelegationPermissionLevel =
  "VIEW_ONLY" | "AUTO_APPROVE" | "SIGNER" | "ADMIN";

export type ColorTag =
  | "slate"
  | "indigo"
  | "emerald"
  | "amber"
  | "rose"
  | "cyan"
  | "violet"
  | "teal";

export interface DelegationPolicy {
  maxPerTransaction: bigint | string | number;
  maxTotal: bigint | string | number;
  allowedMerchants: string[];
  allowedCategories?: string[];
  expiresAt?: string | null;
}

export interface Delegation {
  id: string;
  userId: string;
  agentId: string;
  walletId?: string;
  label?: string;
  colorTag?: ColorTag;
  status: "active" | "paused" | "revoked" | "expired" | "pending";
  permissionLevel?: DelegationPermissionLevel;
  policy: DelegationPolicy;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreateDelegationInput {
  agentId: string;
  walletId: string;
  label: string;
  colorTag?: ColorTag;
  permissionLevel: DelegationPermissionLevel;
  policy: {
    maxPerTransaction: string;
    maxTotal: string;
    allowedMerchants: string[];
    allowedCategories?: string[];
    expiresAt?: string;
  };
}

export interface UpdateDelegationInput {
  status?: Delegation["status"];
  label?: string;
  colorTag?: ColorTag;
  policy?: {
    maxPerTransaction?: string;
    maxTotal?: string;
    allowedMerchants?: string[];
    allowedCategories?: string[];
    expiresAt?: string;
  };
}

export type OrderStatus =
  | "draft"
  | "pending"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "escrowed"
  | "fulfilled"
  | "settled"
  | "completed"
  | "failed"
  | "canceled"
  | "cancelled"
  | "disputed"
  /** Dual-control (#574): first approval recorded, waiting on a second signer. */
  | "awaiting_countersign";

export interface OrderItem {
  name?: string;
  productId?: string;
  price?: number;
  unitPriceStroops?: bigint | string | number;
  quantity: number;
}

/** A single approve/countersign signature captured for an order (#574). */
export interface ApprovalSignature {
  approverId: string;
  approverAddress?: string;
  /** ISO-8601 timestamp, server-issued. */
  timestamp: string;
}

/**
 * Dual-control approval state for a single order (#574). Absent/`required:
 * false` means the order follows the ordinary single-approval path — the
 * feature flag and per-order threshold check are what decide `required`.
 */
export interface DualControlState {
  required: boolean;
  status: "single" | "awaiting_countersign" | "completed";
  /** Wallet/user ids authorized to countersign (the delegation owner list). */
  delegationOwners?: string[];
  firstApproval?: ApprovalSignature;
  secondApproval?: ApprovalSignature;
}

/**
 * Structured reason recorded when a pending order is rejected (#567), so
 * agents can learn *why* an item was unsuitable instead of an unsuitable
 * item being re-proposed indefinitely.
 */
export type RejectionReasonCode =
  | "too_expensive"
  | "wrong_item"
  | "wrong_merchant"
  | "wrong_time"
  | "other";

export interface Order {
  id: string;
  userId?: string;
  delegationId: string;
  merchantId?: string;
  /** @deprecated superseded by merchantId; kept for older call sites. */
  merchantName?: string;
  amount?: bigint | string | number;
  totalStroops?: bigint | string | number;
  currency?: string;
  status: OrderStatus;
  lineItems?: OrderItem[];
  /** @deprecated superseded by lineItems; kept for older call sites. */
  items?: OrderItem[];
  escrowContractId?: string | null;
  /** Structured reject reason (#567). Optional for backward compatibility with rejections recorded before this field existed. */
  rejectionReason?: RejectionReasonCode | null;
  /** Free-text detail accompanying `rejectionReason` (#567). */
  rejectionNote?: string | null;
  dualControl?: DualControlState;
  /** Optional note attached by the approver at approval time (#573). */
  approvalNote?: string | null;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export type EscrowStatus =
  | "funded"
  | "released"
  | "disputed"
  | "refunded"
  | "Funded"
  | "Released"
  | "Disputed"
  | "Refunded"
  /** Cancellation requested; still within the undo grace period (#580). */
  | "cancelling"
  | "cancelled";

/**
 * Server-issued cancellation grace state for an escrow (#580). The
 * expiration must always be read from `graceExpiresAt`/`serverTimestamp` (not
 * a client-computed offset) so the countdown is immune to client clock skew.
 */
export interface CancellationGrace {
  /** ISO-8601 timestamp of the cancel request. */
  requestedAt: string;
  gracePeriodSeconds: number;
  /** ISO-8601 timestamp — the server-authoritative moment the grace period lapses. */
  graceExpiresAt: string;
  /** ISO-8601 timestamp of "now" as seen by the server when it issued this state. */
  serverTimestamp: string;
  cancelledBy?: string;
}

/**
 * Server-issued data-erasure request state (#610) — full server-side account
 * erasure, distinct from the immediate/local-only "clear local data" tier
 * (which never touches the server and has no request lifecycle). Modeled on
 * `CancellationGrace`: the client never marks a request cancelled or
 * finalized on its own — `status` always reflects the server's last answer.
 */
export interface ErasureRequest {
  /** ISO-8601 timestamp the erasure request was logged. */
  requestedAt: string;
  /** ISO-8601 timestamp — the server-authoritative date erasure finalizes if not cancelled. */
  finalizesAt: string;
  /** ISO-8601 timestamp of "now" as seen by the server when it issued this state. */
  serverTimestamp: string;
  status: "pending" | "cancelled" | "finalized";
}

export interface Escrow {
  /**
   * @deprecated most call sites key off `escrowId`, which is what fixtures
   * and the escrows list/countdown UI actually populate; `id` is kept
   * optional for older call sites. Use `escrowKey()` (lib/escrows.ts) to
   * resolve the identifier regardless of which is present.
   */
  id?: string;
  escrowId: string;
  orderId: string;
  /** @deprecated superseded by `buyer`; kept for older call sites. */
  buyerId?: string;
  buyer: string;
  /** @deprecated superseded by `seller`; kept for older call sites. */
  sellerId?: string;
  seller: string;
  amount: bigint | string | number;
  status: EscrowStatus;
  token?: string;
  timeoutLedger?: number;
  currentLedger?: number;
  /** ISO-8601 timestamp of the deadline as originally set on the contract (#577). */
  originalDeadline?: string;
  /** ISO-8601 timestamp of the current effective deadline, after any extensions. */
  deadline?: string;
  /** Count of extension requests already granted against this escrow. */
  extensionsConsumed?: number;
  /** Contract-enforced cap on the number of extensions allowed. */
  maxExtensions?: number;
  /** Contract-enforced cap on total extension time, in seconds. */
  maxExtensionSeconds?: number;
  /** Present while a cancellation is pending or within its undo window (#580). */
  cancellation?: CancellationGrace | null;
  createdAt: Date | string;
}

export const ESCROW_STATUS_META: Record<
  EscrowStatus,
  { label: string; tone: "success" | "pending" | "failed" | "refunded" }
> = {
  funded: { label: "Funded", tone: "pending" },
  released: { label: "Released", tone: "success" },
  disputed: { label: "Disputed", tone: "failed" },
  refunded: { label: "Refunded", tone: "refunded" },
  Funded: { label: "Funded", tone: "pending" },
  Released: { label: "Released", tone: "success" },
  Disputed: { label: "Disputed", tone: "failed" },
  Refunded: { label: "Refunded", tone: "refunded" },
  cancelling: { label: "Cancelling…", tone: "pending" },
  cancelled: { label: "Cancelled", tone: "refunded" },
};

export interface User {
  id: string;
  email: string;
  name?: string;
  walletAddress?: string;
}

export interface UserPreferences {
  currency: string;
  theme: "light" | "dark" | "system";
  notificationsEnabled: boolean;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export * from "./schemas.js";
