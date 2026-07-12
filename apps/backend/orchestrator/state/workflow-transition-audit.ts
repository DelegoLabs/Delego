// Issue #206 — Workflow transition audit persistence

import { randomUUID } from "node:crypto";

export interface WorkflowTransitionAuditRecord {
  id: string;
  orderId: string;
  fromState: string | null;
  toState: string;
  eventType: string;
  createdAt: string;
}

export interface InsertWorkflowTransitionAuditInput {
  orderId: string;
  fromState: string | null;
  toState: string;
  eventType: string;
}

export interface WorkflowTransitionAuditStore {
  insert(input: InsertWorkflowTransitionAuditInput): Promise<WorkflowTransitionAuditRecord>;
}

class InMemoryWorkflowTransitionAuditStore implements WorkflowTransitionAuditStore {
  private readonly rows: WorkflowTransitionAuditRecord[] = [];

  async insert(input: InsertWorkflowTransitionAuditInput): Promise<WorkflowTransitionAuditRecord> {
    const record: WorkflowTransitionAuditRecord = {
      id: randomUUID(),
      orderId: input.orderId,
      fromState: input.fromState,
      toState: input.toState,
      eventType: input.eventType,
      createdAt: new Date().toISOString(),
    };
    this.rows.push(record);
    return record;
  }

  snapshot(): readonly WorkflowTransitionAuditRecord[] {
    return [...this.rows];
  }

  clear(): void {
    this.rows.length = 0;
  }
}

let auditStore: WorkflowTransitionAuditStore = new InMemoryWorkflowTransitionAuditStore();

/** Swap for a Postgres implementation backed by workflow_transition_audit. */
export function setWorkflowTransitionAuditStore(store: WorkflowTransitionAuditStore): void {
  auditStore = store;
}

export function resetWorkflowTransitionAuditStore(): void {
  auditStore = new InMemoryWorkflowTransitionAuditStore();
}

/**
 * Inserts a lightweight audit row after a successful workflow transition.
 * Backed by `workflow_transition_audit` (see database/migrations/008_workflow_transition_audit.sql).
 */
export async function insertWorkflowTransitionAudit(
  input: InsertWorkflowTransitionAuditInput
): Promise<WorkflowTransitionAuditRecord> {
  if (!input.orderId || input.orderId.trim() === "") {
    throw new Error("orderId is required");
  }
  if (!input.toState || input.toState.trim() === "") {
    throw new Error("toState is required");
  }
  if (!input.eventType || input.eventType.trim() === "") {
    throw new Error("eventType is required");
  }

  return auditStore.insert(input);
}

/** Test helper — returns a snapshot of stored audit rows. */
export function snapshotWorkflowTransitionAudit(): readonly WorkflowTransitionAuditRecord[] {
  if (auditStore instanceof InMemoryWorkflowTransitionAuditStore) {
    return auditStore.snapshot();
  }
  return [];
}
