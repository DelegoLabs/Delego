import type {
  Delegation,
  Order,
  User,
  UserPreferences,
} from "@delegolabs/types";
import packageJson from "../package.json";
import { api } from "./api";
import { lifecycleIndex } from "./orders";

/** Rows are serialized in batches so we never hold one giant JSON string in memory and so progress/cancel checks run between batches. */
const BATCH_SIZE = 200;

export interface ExportedProfile {
  id: string;
  stellarAddress: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExportedPreferences {
  defaultSpendingLimitStroops: string;
  requireApproval: boolean;
  notificationEmail: boolean;
  notificationPush: boolean;
}

export interface ExportedDelegation {
  id: string;
  agentId: string;
  status: string;
  policy: {
    maxPerTransactionStroops: string;
    maxTotalStroops: string;
    allowedMerchants: string[];
    expiresAt: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ExportedOrder {
  id: string;
  merchantId: string;
  delegationId: string;
  status: string;
  totalStroops: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * There's no dedicated "approval decisions" API — a decision is just an
 * order that has moved past `pending_approval`. Derived here rather than
 * fetched, since Order is the only record of it (see docs/architecture/export-format.md).
 */
export interface ExportedApprovalDecision {
  orderId: string;
  decision: "approved" | "rejected";
  amountStroops: string;
  merchantId: string;
  decidedAt: string;
}

export interface ExportEnvelope {
  generatedAt: string;
  appVersion: string;
  account: {
    profile: ExportedProfile;
    preferences: ExportedPreferences;
  };
  delegations: ExportedDelegation[];
  orders: ExportedOrder[];
  approvalDecisions: ExportedApprovalDecision[];
}

export type ExportPhase =
  | "delegations"
  | "orders"
  | "assembling-delegations"
  | "assembling-orders"
  | "assembling-decisions";

export interface ExportProgress {
  phase: ExportPhase;
  completed: number;
  total: number;
}

export interface BuildAccountExportOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}

function toExportedProfile(user: any): ExportedProfile {
  return {
    id: user.id,
    stellarAddress: user.stellarAddress,
    displayName: user.displayName,
    email: user.email,
    createdAt: new Date(user.createdAt).toISOString(),
    updatedAt: new Date(user.updatedAt).toISOString(),
  };
}

function toExportedPreferences(
  preferences: any
): ExportedPreferences {
  return {
    defaultSpendingLimitStroops: preferences.defaultSpendingLimit.toString(),
    requireApproval: preferences.requireApproval,
    notificationEmail: preferences.notificationEmail,
    notificationPush: preferences.notificationPush,
  };
}

function toExportedDelegation(delegation: Delegation): ExportedDelegation {
  return {
    id: delegation.id,
    agentId: delegation.agentId,
    status: delegation.status,
    policy: {
      maxPerTransactionStroops: delegation.policy.maxPerTransaction.toString(),
      maxTotalStroops: delegation.policy.maxTotal.toString(),
      allowedMerchants: delegation.policy.allowedMerchants,
      expiresAt: delegation.policy.expiresAt ?? null,
    },
    createdAt: new Date(delegation.createdAt).toISOString(),
    updatedAt: new Date(delegation.updatedAt).toISOString(),
  };
}

function toExportedOrder(order: any): ExportedOrder {
  return {
    id: order.id,
    merchantId: order.merchantId,
    delegationId: order.delegationId,
    status: order.status,
    totalStroops: (order.totalStroops ?? 0).toString(),
    createdAt: new Date(order.createdAt).toISOString(),
    updatedAt: new Date(order.updatedAt).toISOString(),
  };
}

/** An order has a decision once it's past pending_approval; happy-path statuses read as "approved", off-path ones (cancelled/disputed/...) as "rejected". */
function decisionForOrder(order: any): ExportedApprovalDecision | null {
  if (order.status === "draft" || order.status === "pending_approval") {
    return null;
  }
  const isHappyPath = lifecycleIndex(order.status) >= 0;
  return {
    orderId: order.id,
    decision: isHappyPath ? "approved" : "rejected",
    amountStroops: (order.totalStroops ?? 0).toString(),
    merchantId: order.merchantId,
    decidedAt: new Date(order.updatedAt).toISOString(),
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Export cancelled", "AbortError");
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** JSON-serializes `items` in batches, returning the parts of a `[...]` array (never one giant joined string). */
async function serializeArrayChunked<T>(
  items: T[],
  serialize: (item: T) => unknown,
  phase: ExportPhase,
  options: BuildAccountExportOptions
): Promise<string[]> {
  const parts: string[] = ["["];
  let completed = 0;

  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    throwIfAborted(options.signal);
    const batch = items.slice(start, start + BATCH_SIZE);
    for (const item of batch) {
      const value = serialize(item);
      if (value === null || value === undefined) continue; // e.g. an order with no decision yet
      const encoded = JSON.stringify(value);
      parts.push(parts.length === 1 ? encoded : `,${encoded}`);
    }
    completed += batch.length;
    options.onProgress?.({ phase, completed, total: items.length });
    await yieldToEventLoop();
  }

  parts.push("]");
  return parts;
}

/**
 * Assembles the whole-account export as a downloadable JSON Blob. Fetches
 * delegations and orders via the same DelegoClient the rest of the app uses
 * (the SDK has no server-side pagination today — see
 * docs/architecture/export-format.md — so "chunked" applies to how the
 * response is serialized and handed to Blob, not to the network fetch).
 * `options.signal` is checked between every batch so cancel is responsive
 * even mid-serialization, not just mid-fetch.
 */
export async function buildAccountExport(
  user: User,
  preferences: UserPreferences,
  options: BuildAccountExportOptions = {}
): Promise<Blob> {
  const { signal, onProgress } = options;

  onProgress?.({ phase: "delegations", completed: 0, total: 0 });
  const delegationsRes = await api.getDelegations(
    signal ? { signal } : undefined
  );
  throwIfAborted(signal);
  const delegations = delegationsRes.data ?? [];

  onProgress?.({ phase: "orders", completed: 0, total: 0 });
  const ordersRes = await api.getOrders({ signal });
  throwIfAborted(signal);
  const orders = ordersRes.data ?? [];

  const delegationParts = await serializeArrayChunked(
    delegations,
    toExportedDelegation,
    "assembling-delegations",
    options
  );
  const orderParts = await serializeArrayChunked(
    orders,
    toExportedOrder,
    "assembling-orders",
    options
  );
  const decisionParts = await serializeArrayChunked(
    orders,
    decisionForOrder,
    "assembling-decisions",
    options
  );

  const header = `{"generatedAt":${JSON.stringify(new Date().toISOString())},"appVersion":${JSON.stringify(
    packageJson.version
  )},"account":{"profile":${JSON.stringify(toExportedProfile(user))},"preferences":${JSON.stringify(
    toExportedPreferences(preferences)
  )}},"delegations":`;

  return new Blob(
    [
      header,
      ...delegationParts,
      ',"orders":',
      ...orderParts,
      ',"approvalDecisions":',
      ...decisionParts,
      "}",
    ],
    { type: "application/json" }
  );
}
