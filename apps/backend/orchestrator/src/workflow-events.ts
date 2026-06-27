// Issue #130 — Workflow event correlation and publishing
import { generateId } from "@delego/utils";

export interface WorkflowEventEnvelope<T = Record<string, unknown>> {
  correlationId: string;
  orderId: string;
  type: string;
  payload: T;
  timestamp: string;
}

/** In-memory sink for workflow events — swap for Redis publish in production. */
export const publishedWorkflowEvents: WorkflowEventEnvelope[] = [];

export function clearPublishedWorkflowEvents(): void {
  publishedWorkflowEvents.length = 0;
}

export function createWorkflowCorrelationId(): string {
  return generateId();
}

export function createWorkflowEventEnvelope<T>(
  correlationId: string,
  orderId: string,
  type: string,
  payload: T
): WorkflowEventEnvelope<T> {
  return {
    correlationId,
    orderId,
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Publishes a workflow event envelope. In production this would call Redis;
 * for now events are retained in-memory for tests and downstream wiring.
 */
export function publishWorkflowEvent<T>(envelope: WorkflowEventEnvelope<T>): void {
  publishedWorkflowEvents.push(envelope as WorkflowEventEnvelope);
}
