/**
 * Core XState-style purchase workflow machine (issue #7).
 *
 * Implements the state graph:
 *   Discovery → SpendingCheck → UserApprovalPending → EscrowLocking
 *     → MerchantFulfillment → DeliveryVerification → Completed
 * Any state (except Completed) can transition to Refunded.
 *
 * All transitions are synchronously computed and returned as a new snapshot.
 * Persistence (logging to database) is the caller's responsibility via the
 * `onTransition` hook, enabling the machine to be stateless and crash-safe.
 */

import { assertValidSnapshot, SNAPSHOT_VERSION } from "./snapshot-validator.js";
import {
  recordWorkflowEvent,
  getWorkflowEventStore,
} from "../src/events/eventStore.js";
import type {
  PurchaseContext,
  PurchaseEvent,
  PurchaseState,
  StateTransitionRecord,
  WorkflowSnapshot,
} from "./types.js";

export type TransitionHook = (record: StateTransitionRecord) => Promise<void>;

type Transition = {
  [E in PurchaseEvent["type"]]?: PurchaseState;
};

const TRANSITIONS: Record<PurchaseState, Transition> = {
  Discovery: {
    PRODUCT_FOUND: "SpendingCheck",
  },
  SpendingCheck: {
    SPEND_APPROVED: "UserApprovalPending",
    SPEND_DENIED: "Refunded",
  },
  UserApprovalPending: {
    USER_APPROVED: "EscrowLocking",
    USER_REJECTED: "Refunded",
  },
  EscrowLocking: {
    ESCROW_LOCKED: "MerchantFulfillment",
    ESCROW_FAILED: "Refunded",
  },
  MerchantFulfillment: {
    FULFILLMENT_CONFIRMED: "DeliveryVerification",
    REFUND_INITIATED: "Refunded",
  },
  DeliveryVerification: {
    DELIVERY_VERIFIED: "Completed",
    REFUND_INITIATED: "Refunded",
  },
  Completed: {},
  Refunded: {},
};

/** Terminal states — no further transitions are permitted. */
const TERMINAL_STATES: ReadonlySet<PurchaseState> = new Set([
  "Completed",
  "Refunded",
]);

function applyContextUpdate(
  ctx: PurchaseContext,
  event: PurchaseEvent
): PurchaseContext {
  const now = new Date();
  switch (event.type) {
    case "PRODUCT_FOUND":
      return {
        ...ctx,
        productId: event.productId,
        merchantId: event.merchantId,
        totalStroops: event.totalStroops,
        updatedAt: now,
      };
    case "SPEND_DENIED":
      return { ...ctx, rejectionReason: event.reason, updatedAt: now };
    case "USER_REJECTED":
      return { ...ctx, rejectionReason: "user_rejected", updatedAt: now };
    case "ESCROW_LOCKED":
      return { ...ctx, escrowContractId: event.escrowContractId, updatedAt: now };
    case "ESCROW_FAILED":
      return { ...ctx, rejectionReason: event.reason, updatedAt: now };
    case "REFUND_INITIATED":
      return { ...ctx, rejectionReason: event.reason, updatedAt: now };
    default:
      return { ...ctx, updatedAt: now };
  }
}

export class PurchaseWorkflowMachine {
  private snapshot: WorkflowSnapshot;
  private readonly onTransition: TransitionHook | undefined;

  constructor(
    initialContext: Pick<PurchaseContext, "workflowId" | "delegationId" | "userId">,
    onTransition?: TransitionHook
  ) {
    const now = new Date();
    const ctx: PurchaseContext = {
      workflowId: initialContext.workflowId,
      delegationId: initialContext.delegationId,
      userId: initialContext.userId,
      productId: null,
      merchantId: null,
      totalStroops: null,
      escrowContractId: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    };

    this.snapshot = {
      workflowId: initialContext.workflowId,
      currentState: "Discovery",
      context: ctx,
      history: [],
      version: SNAPSHOT_VERSION,
    };
    this.onTransition = onTransition;
  }

  /** Restore a machine from a previously persisted snapshot (crash recovery). */
  static fromSnapshot(
    snapshot: unknown,
    onTransition?: TransitionHook
  ): PurchaseWorkflowMachine {
    assertValidSnapshot(snapshot);
    const machine = new PurchaseWorkflowMachine(
      {
        workflowId: snapshot.workflowId,
        delegationId: snapshot.context.delegationId,
        userId: snapshot.context.userId,
      },
      onTransition
    );
    machine.snapshot = snapshot;
    return machine;
  }

  /**
   * Replay events from the event store to reconstruct the current state.
   * This provides complete state reconstruction without requiring a snapshot.
   *
   * @param workflowId - The workflow ID to replay events for.
   * @param initialContext - The initial context used when the workflow was created.
   * @param onTransition - Optional hook called on each transition.
   */
  static async fromEventReplay(
    workflowId: string,
    initialContext: Pick<PurchaseContext, "workflowId" | "delegationId" | "userId">,
    onTransition?: TransitionHook
  ): Promise<PurchaseWorkflowMachine> {
    const store = getWorkflowEventStore();
    const events = await store.getEvents(workflowId);

    if (events.length === 0) {
      throw new Error(`No events found for workflow ${workflowId}`);
    }

    const machine = new PurchaseWorkflowMachine(initialContext, onTransition);

    for (const event of events) {
      await machine.send(event.payload as PurchaseEvent);
    }

    return machine;
  }

  get currentState(): PurchaseState {
    return this.snapshot.currentState;
  }

  get context(): PurchaseContext {
    return this.snapshot.context;
  }

  get isTerminal(): boolean {
    return TERMINAL_STATES.has(this.snapshot.currentState);
  }

  async send(event: PurchaseEvent): Promise<WorkflowSnapshot> {
    if (this.isTerminal) {
      throw new Error(
        `Workflow ${this.snapshot.workflowId} is in terminal state "${this.snapshot.currentState}" and cannot accept further events`
      );
    }

    const allowed = TRANSITIONS[this.snapshot.currentState];
    const nextState = allowed[event.type as keyof typeof allowed] as PurchaseState | undefined;

    if (!nextState) {
      throw new Error(
        `Event "${event.type}" is not valid in state "${this.snapshot.currentState}"`
      );
    }

    const updatedContext = applyContextUpdate(this.snapshot.context, event);

    const record: StateTransitionRecord = {
      workflowId: this.snapshot.workflowId,
      fromState: this.snapshot.currentState,
      toState: nextState,
      event: event.type,
      context: updatedContext,
      timestamp: new Date(),
    };

    this.snapshot = {
      ...this.snapshot,
      currentState: nextState,
      context: updatedContext,
      history: [...this.snapshot.history, record],
    };

    if (this.onTransition) {
      await this.onTransition(record);
    }

    // Event sourcing: record every transition to the event store
    try {
      await recordWorkflowEvent({
        workflowId: this.snapshot.workflowId,
        eventType: event.type,
        payload: event,
        fromState: record.fromState,
        toState: record.toState,
        metadata: {
          snapshotVersion: this.snapshot.version,
        },
      });
    } catch (err: any) {
      // Event recording is best-effort; don't fail the transition
      // but log a warning for observability.
      console.warn("Failed to record workflow event", {
        workflowId: this.snapshot.workflowId,
        eventType: event.type,
        error: err.message,
      });
    }

    return this.getSnapshot();
  }

  getSnapshot(): WorkflowSnapshot {
    return {
      workflowId: this.snapshot.workflowId,
      currentState: this.snapshot.currentState,
      context: { ...this.snapshot.context },
      history: [...this.snapshot.history],
      version: this.snapshot.version,
    };
  }
}
