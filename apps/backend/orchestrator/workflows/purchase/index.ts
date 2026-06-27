/**
 * #19 Purchase Workflow State Machine
 * XState-style state machine with PostgreSQL persistence and Redis Pub/Sub.
 */
import { createLogger } from "@delego/utils";
import { generateId } from "@delego/utils";
import { Redis } from "ioredis";
import { Pool } from "pg";

const log = createLogger("orchestrator:purchase", process.env.LOG_LEVEL ?? "info");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductMatch {
  id: string;
  name: string;
  merchant: string;
  priceStroops: string;
  url: string;
}
 * Purchase workflow — delegates to PurchaseWorkflowMachine (issue #7).
 *
 * The machine persists every transition via the `onTransition` hook.
 * Callers can restore a crashed workflow with PurchaseWorkflowMachine.fromSnapshot().
 */

import { randomUUID } from "node:crypto";
import { PurchaseWorkflowMachine } from "../../state/index.js";
import type {
  WorkflowSnapshot,
  TransitionHook,
} from "../../state/index.js";

export type PurchaseState =
  | "INITIATED"
  | "SEARCHING"
  | "FOUND"
  | "APPROVED"
  | "ESCROW_FUNDED"
  | "PURCHASED"
  | "DELIVERING"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export type PurchaseEvent =
  | { type: "SEARCH"; query: string; delegationId: string }
  | { type: "PRODUCTS_FOUND"; products: ProductMatch[] }
  | { type: "APPROVE"; selectedProductId: string }
  | { type: "REJECT" }
  | { type: "ESCROW_FUNDED"; escrowId: string; txHash: string }
  | { type: "ESCROW_FAILED"; reason: string }
  | { type: "PURCHASE_CONFIRMED"; merchantOrderId: string }
  | { type: "DELIVERY_CONFIRMED"; proof: string }
  | { type: "SETTLE"; txHash: string }
  | { type: "CANCEL"; reason: string }
  | { type: "TIMEOUT" }
  | { type: "FAIL"; error: string };

export interface PurchaseContext {
  orderId: string;
  userId: string;
  delegationId: string;
  query: string;
  products: ProductMatch[];
  selectedProductId: string | null;
  escrowId: string | null;
  escrowTxHash: string | null;
  merchantOrderId: string | null;
  settlementTxHash: string | null;
  error: string | null;
  createdAt: Date;
}

export interface WorkflowSnapshot {
  orderId: string;
  state: PurchaseState;
  context: PurchaseContext;
  updatedAt: Date;
}

export interface WorkflowEvent {
  orderId: string;
  userId: string;
  previousState: string;
  currentState: string;
  event: string;
  timestamp: string;
}

// ─── Transitions ──────────────────────────────────────────────────────────────

type TransitionMap = Partial<Record<PurchaseEvent["type"], PurchaseState>>;

const TRANSITIONS: Record<PurchaseState, TransitionMap> = {
  INITIATED: { SEARCH: "SEARCHING", CANCEL: "CANCELLED" },
  SEARCHING: { PRODUCTS_FOUND: "FOUND", CANCEL: "CANCELLED", TIMEOUT: "CANCELLED", FAIL: "FAILED" },
  FOUND: { APPROVE: "APPROVED", REJECT: "CANCELLED", CANCEL: "CANCELLED" },
  APPROVED: { ESCROW_FUNDED: "ESCROW_FUNDED", ESCROW_FAILED: "CANCELLED", CANCEL: "CANCELLED" },
  ESCROW_FUNDED: { PURCHASE_CONFIRMED: "PURCHASED", CANCEL: "CANCELLED", FAIL: "FAILED" },
  PURCHASED: { DELIVERY_CONFIRMED: "DELIVERING", CANCEL: "CANCELLED", FAIL: "FAILED" },
  DELIVERING: { SETTLE: "DELIVERED", FAIL: "FAILED" },
  DELIVERED: { SETTLE: "COMPLETED" },
  COMPLETED: {},
  CANCELLED: {},
  FAILED: {},
};

function applyEvent(state: PurchaseState, event: PurchaseEvent, ctx: PurchaseContext): { state: PurchaseState; context: PurchaseContext } {
  const next = TRANSITIONS[state]?.[event.type];
  if (!next) throw new Error(`Invalid transition: ${event.type} from ${state}`);

  const context = { ...ctx };
  switch (event.type) {
    case "SEARCH": context.query = event.query; context.delegationId = event.delegationId; break;
    case "PRODUCTS_FOUND": context.products = event.products; break;
    case "APPROVE": context.selectedProductId = event.selectedProductId; break;
    case "ESCROW_FUNDED": context.escrowId = event.escrowId; context.escrowTxHash = event.txHash; break;
    case "ESCROW_FAILED": context.error = event.reason; break;
    case "PURCHASE_CONFIRMED": context.merchantOrderId = event.merchantOrderId; break;
    case "SETTLE": context.settlementTxHash = event.txHash; break;
    case "CANCEL": context.error = event.reason; break;
    case "FAIL": context.error = event.error; break;
  }
  return { state: next, context };
}

// ─── Infrastructure ───────────────────────────────────────────────────────────

function getRedis(): Redis {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
}

function getPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

const redis = getRedis();
const pool = getPool();

async function persistWorkflow(snapshot: WorkflowSnapshot): Promise<void> {
  await pool.query(
    `INSERT INTO purchase_workflows (order_id, user_id, state, context, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (order_id) DO UPDATE SET state = $3, context = $4, updated_at = $5`,
    [snapshot.orderId, snapshot.context.userId, snapshot.state, JSON.stringify(snapshot.context), snapshot.updatedAt]
  );
}

async function loadWorkflow(orderId: string): Promise<WorkflowSnapshot | null> {
  const { rows } = await pool.query<{ order_id: string; state: string; context: PurchaseContext; updated_at: Date }>(
    `SELECT order_id, state, context, updated_at FROM purchase_workflows WHERE order_id = $1`,
    [orderId]
  );
  if (!rows[0]) return null;
  return {
    orderId: rows[0].order_id,
    state: rows[0].state as PurchaseState,
    context: rows[0].context as PurchaseContext,
    updatedAt: rows[0].updated_at,
  };
}

async function publishEvent(evt: WorkflowEvent): Promise<void> {
  try {
    await redis.publish("workflow:state_changed", JSON.stringify(evt));
  } catch (err) {
    log.warn("Redis publish failed", { error: (err as Error).message });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function createWorkflow(
  userId: string,
  delegationId: string,
  query: string
): Promise<string> {
  const orderId = generateId();
  const now = new Date();
  const context: PurchaseContext = {
    orderId,
    userId,
    delegationId,
    query,
    products: [],
    selectedProductId: null,
    escrowId: null,
    escrowTxHash: null,
    merchantOrderId: null,
    settlementTxHash: null,
    error: null,
    createdAt: now,
  userId: string;
  /** Override the auto-generated workflow ID (e.g. for replay). */
  workflowId?: string;
}

export interface PurchaseWorkflowHandle {
  machine: PurchaseWorkflowMachine;
  snapshot: WorkflowSnapshot;
}

export interface PurchaseWorkflowState {
  step: "init" | "catalog" | "approval" | "escrow" | "complete" | "payment_timeout";
  orderId: string | null;
}

// Issue #208 — Payment Timeout Transition Handler

export interface PaymentTimeoutEvent {
  orderId: string;
  timeoutAt: string;
  reason: "escrow_funding_timeout";
}

export interface CancellationEvent {
  orderId: string;
  reason: "payment_timeout";
  occurredAt: string;
}

/**
 * Transitions a purchase workflow to payment_timeout when escrow funding does not
 * complete in time. Returns a CancellationEvent for downstream consumption.
 */
export function handlePaymentTimeout(event: PaymentTimeoutEvent): CancellationEvent {
  return {
    orderId: event.orderId,
    reason: "payment_timeout",
    occurredAt: new Date().toISOString(),
  };
  const snapshot: WorkflowSnapshot = { orderId, state: "INITIATED", context, updatedAt: now };
  await persistWorkflow(snapshot);
  log.info("Workflow created", { orderId, userId });
  return orderId;
}

export async function transitionWorkflow(
  orderId: string,
  event: PurchaseEvent
): Promise<WorkflowSnapshot> {
  const snapshot = await loadWorkflow(orderId);
  if (!snapshot) throw new Error(`Workflow not found: ${orderId}`);

  const previousState = snapshot.state;
  const { state, context } = applyEvent(snapshot.state, event, snapshot.context);
  const updatedAt = new Date();
  const next: WorkflowSnapshot = { orderId, state, context, updatedAt };

  await persistWorkflow(next);
  await publishEvent({
    orderId,
    userId: context.userId,
    previousState,
    currentState: state,
    event: event.type,
    timestamp: updatedAt.toISOString(),
  });

  log.info("Workflow transitioned", { orderId, from: previousState, to: state, event: event.type });
  return next;
}

export async function getWorkflow(orderId: string): Promise<WorkflowSnapshot> {
  const snapshot = await loadWorkflow(orderId);
  if (!snapshot) throw new Error(`Workflow not found: ${orderId}`);
  return snapshot;
}

export async function listWorkflows(
  userId: string,
  status?: PurchaseState
): Promise<WorkflowSnapshot[]> {
  const query = status
    ? `SELECT order_id, state, context, updated_at FROM purchase_workflows WHERE context->>'userId' = $1 AND state = $2 ORDER BY updated_at DESC`
    : `SELECT order_id, state, context, updated_at FROM purchase_workflows WHERE context->>'userId' = $1 ORDER BY updated_at DESC`;
  const params = status ? [userId, status] : [userId];
  const { rows } = await pool.query<{ order_id: string; state: string; context: PurchaseContext; updated_at: Date }>(query, params);
  return rows.map((r) => ({
    orderId: r.order_id,
    state: r.state as PurchaseState,
    context: r.context as PurchaseContext,
    updatedAt: r.updated_at,
  }));
}

// Legacy export for backwards compat
export { createWorkflow as purchaseWorkflow };
// Issue #209 — Delivery Proof Validation Adapter

export interface DeliveryProofValidation {
  orderId: string;
  proofId: string;
  valid: boolean;
  reason?: string;
}

export interface DeliveryProofAdapter {
  validate(orderId: string, proofId: string): Promise<DeliveryProofValidation>;
}

/** Stub adapter — replace with a real delivery verification service. */
export const defaultDeliveryProofAdapter: DeliveryProofAdapter = {
  async validate(orderId, proofId) {
    return { orderId, proofId, valid: false, reason: "adapter_not_configured" };
  },
};

export class DeliveryProofInvalidError extends Error {
  constructor(public readonly validation: DeliveryProofValidation) {
    super(
      `Delivery proof invalid for order ${validation.orderId}: ${validation.reason ?? "unknown"}`
    );
    this.name = "DeliveryProofInvalidError";
  }
}

/**
 * Validates delivery proof before settlement is requested.
 * Throws DeliveryProofInvalidError to block the settlement transition when proof is invalid.
 */
export async function validateDeliveryProof(
  orderId: string,
  proofId: string,
  adapter: DeliveryProofAdapter = defaultDeliveryProofAdapter
): Promise<DeliveryProofValidation> {
  const result = await adapter.validate(orderId, proofId);
  if (!result.valid) {
    throw new DeliveryProofInvalidError(result);
  }
  return result;
}

/**
 * Creates a new purchase workflow machine wired to the provided persistence hook.
 *
 * The `onTransition` hook is called after every valid state transition.
 * Pass a database writer here to durably log transitions and enable crash recovery.
 */
export function purchaseWorkflow(
  input: PurchaseWorkflowInput,
  onTransition?: TransitionHook
): PurchaseWorkflowHandle {
  const workflowId = input.workflowId ?? randomUUID();

  const machine = new PurchaseWorkflowMachine(
    {
      workflowId,
      delegationId: input.delegationId,
      userId: input.userId,
    },
    onTransition
  );

  return { machine, snapshot: machine.getSnapshot() };
}

/**
 * Restores a purchase workflow from a persisted snapshot.
 * Use this after a service restart to resume in-progress workflows.
 */
export function restorePurchaseWorkflow(
  snapshot: WorkflowSnapshot,
  onTransition?: TransitionHook
): PurchaseWorkflowHandle {
  const machine = PurchaseWorkflowMachine.fromSnapshot(snapshot, onTransition);
  return { machine, snapshot: machine.getSnapshot() };
}

export {
  lookupOrderPaymentStatus,
  createHttpOrderLookupAdapter,
  createHttpOrderLookupClient,
  defaultOrderLookupAdapter,
  OrderPaymentNotFoundError,
  type OrderPaymentStatus,
  type OrderLookupAdapter,
} from "./order-lookup.js";
