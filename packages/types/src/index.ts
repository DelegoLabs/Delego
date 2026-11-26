export type DisplayCurrencyMode = "crypto_primary" | "fiat_primary";

export interface CurrencyPreference {
  mode: DisplayCurrencyMode;
  targetFiat: "USD" | "EUR" | "GBP" | "NGN";
}

export interface MerchantPolicyInfo {
  returnWindowDays: number;
  restockingFeePercent: number;
  freeShippingThresholdStroops: string;
  escrowProtectionNotice: string;
}

export type DelegationPermissionLevel =
  | "VIEW_ONLY"
  | "AUTO_APPROVE"
  | "SIGNER"
  | "ADMIN";

export type ColorTag =
  | "slate"
  | "indigo"
  | "emerald"
  | "amber"
  | "rose"
  | "cyan"
  | "violet"
  | "teal";

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number;
}

export interface DelegationPolicy {
  maxPerTransaction: any;
  maxTotal: any;
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
  | "awaiting_countersign";

export interface OrderItem {
  name?: string;
  productId?: string;
  price?: number;
  unitPriceStroops?: any;
  quantity: number;
  category?: string;
}

export type TrackingStatus =
  | "label_created"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception";

export interface TrackingEvent {
  status?: TrackingStatus;
  timestamp: string;
  location: string;
  description: string;
}

export interface PackageTrackingInfo {
  packageId: string;
  carrierName: string;
  trackingNumber: string;
  status: TrackingStatus;
  estimatedDelivery?: string;
  events: TrackingEvent[];
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
  merchantName?: string;
  amount?: any;
  totalStroops?: any;
  currency?: string;
  status: OrderStatus;
  lineItems?: OrderItem[];
  items?: OrderItem[];
  packages?: PackageTrackingInfo[];
  escrowContractId?: string | null;
  rejectionReason?: RejectionReasonCode | null;
  rejectionNote?: string | null;
  dualControl?: DualControlState;
  approvalNote?: string | null;
  giftOptions?: GiftOptions;
  metadata?: {
    giftOptions?: GiftOptions;
    [key: string]: unknown;
  };
  category?: string | null;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export interface GiftOptions {
  isGift: boolean;
  recipientName?: string;
  giftMessage?: string;
  hidePackingSlipPrice: boolean;
}

export type DisputeStatus = string;
export type DisputeReason = string;
export type ContractName = string;
export type ContractVersionInfo = any;
export type CreateDisputeInput = any;
export type Dispute = any;

export type EscrowStatus =
  | "funded"
  | "released"
  | "disputed"
  | "refunded"
  | "Funded"
  | "Released"
  | "Disputed"
  | "Refunded"
  | "cancelling"
  | "cancelled";

export interface CancellationGrace {
  requestedAt: string;
  gracePeriodSeconds: number;
  graceExpiresAt: string;
  serverTimestamp: string;
  cancelledBy?: string;
}

export interface ErasureRequest {
  requestedAt: string;
  finalizesAt: string;
  serverTimestamp: string;
  status: "pending" | "cancelled" | "finalized";
}

export interface Escrow {
  id?: string;
  escrowId: string;
  orderId: string;
  buyerId?: string;
  buyer: string;
  sellerId?: string;
  seller: string;
  amount: any;
  status: EscrowStatus;
  token?: string;
  timeoutLedger?: number;
  currentLedger?: number;
  originalDeadline?: string;
  deadline?: string;
  extensionsConsumed?: number;
  maxExtensions?: number;
  maxExtensionSeconds?: number;
  cancellation?: CancellationGrace | null;
  createdAt: Date | string;
  arbiter?: string;
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

export interface AssetRevenueBreakdown {
  assetCode: string;
  symbol: string;
  settledVolumeStroops: string;
  pendingEscrowVolumeStroops: string;
  refundedVolumeStroops: string;
  fiatEquivalentUsd: number;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  walletAddress?: string;
  stellarAddress?: string;
  displayName?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface UserPreferences {
  userId?: string;
  currency: string;
  theme: "light" | "dark" | "system";
  notificationsEnabled: boolean;
  defaultSpendingLimit?: string | number | bigint;
  requireApproval?: boolean;
  notificationEmail?: boolean;
  notificationPush?: boolean;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export interface UserPreferenceItem {
  key: string;
  value: string | number | boolean;
  category: "agent" | "ui" | "privacy" | "wallet";
  updatedAt: string;
}

export type OfflineStatus = "online" | "offline" | "reconnecting";

export interface ConnectivityState {
  isOnline: boolean;
  queuedActionCount: number;
  lastConnectedTimestamp: number;
}

export interface TokenAllowanceEntry {
  tokenAddress: string;
  tokenSymbol: string;
  spenderAddress: string;
  spenderLabel: string;
  allowedAmountStroops: string;
  expirationLedger: number;
}

export interface Sep0024InteractiveSession {
  anchorDomain: string;
  assetCode: string;
  action: "deposit" | "withdraw";
  interactiveUrl: string;
  transactionId: string;
}

export interface QrDownloadOptions {
  format: "png" | "svg";
  sizePx: number;
  fileName: string;
}

export interface SorobanSimulationMetrics {
  cpuInstructions: number;
  memoryBytes: number;
  minResourceFeeStroops: string;
  readBytes: number;
  writeBytes: number;
  isSimulatedSuccessfully: boolean;
}

export interface LedgerConnectionState {
  isConnected: boolean;
  bip32Path: string;
  publicKey?: string;
  deviceModel?: string;
  isAppOpen: boolean;
}

export * from "./schemas.js";

export interface SavedShippingAddress {
  id: string;
  label: "Home" | "Work" | "Other";
  recipientName: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}
