import { describe, it, expect, beforeEach } from "vitest";
import { WorkflowEventGuard } from "./idempotency.js";
import type { WorkflowEventIdempotencyKey } from "./idempotency.js";

const base: WorkflowEventIdempotencyKey = {
  orderId: "ord-1",
  eventId: "evt-abc",
  eventType: "payment_received",
};

describe("WorkflowEventGuard", () => {
  let guard: WorkflowEventGuard;

  beforeEach(() => {
    guard = new WorkflowEventGuard();
  });

  it("returns false for a new event (first delivery)", () => {
    expect(guard.isProcessed(base)).toBe(false);
  });

  it("returns true after marking an event processed", () => {
    guard.markProcessed(base);
    expect(guard.isProcessed(base)).toBe(true);
  });

  it("ignores duplicate delivery — isProcessed stays true after second markProcessed", () => {
    guard.markProcessed(base);
    guard.markProcessed(base);
    expect(guard.isProcessed(base)).toBe(true);
  });

  it("distinguishes events by eventId", () => {
    const other = { ...base, eventId: "evt-xyz" };
    guard.markProcessed(base);
    expect(guard.isProcessed(base)).toBe(true);
    expect(guard.isProcessed(other)).toBe(false);
  });

  it("distinguishes events by eventType", () => {
    const other = { ...base, eventType: "order_cancelled" };
    guard.markProcessed(base);
    expect(guard.isProcessed(base)).toBe(true);
    expect(guard.isProcessed(other)).toBe(false);
  });

  it("each guard instance is independent (no shared state)", () => {
    const guard2 = new WorkflowEventGuard();
    guard.markProcessed(base);
    expect(guard.isProcessed(base)).toBe(true);
    expect(guard2.isProcessed(base)).toBe(false);
  });
});
