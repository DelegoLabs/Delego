// Issue #207 — Workflow Event Replay Guard
export interface WorkflowEventIdempotencyKey {
  orderId: string;
  eventId: string;
  eventType: string;
}

/** In-memory guard — swap backing store for Redis/DB in production. */
export class WorkflowEventGuard {
  private readonly processed = new Set<string>();

  private key(k: WorkflowEventIdempotencyKey): string {
    return `workflow:idempotency:${k.orderId}:${k.eventType}:${k.eventId}`;
  }

  isProcessed(key: WorkflowEventIdempotencyKey): boolean {
    return this.processed.has(this.key(key));
  }

  markProcessed(key: WorkflowEventIdempotencyKey): void {
    this.processed.add(this.key(key));
  }
}
