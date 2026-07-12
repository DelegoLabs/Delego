import { describe, it, expect, beforeEach } from "vitest";
import {
  insertWorkflowTransitionAudit,
  resetWorkflowTransitionAuditStore,
  snapshotWorkflowTransitionAudit,
} from "./workflow-transition-audit.js";

describe("insertWorkflowTransitionAudit (issue #206)", () => {
  beforeEach(() => {
    resetWorkflowTransitionAuditStore();
  });

  it("inserts an audit row on successful transition", async () => {
    const record = await insertWorkflowTransitionAudit({
      orderId: "order-123",
      fromState: "initiated",
      toState: "pending_approval",
      eventType: "checkout_pending_approval",
    });

    expect(record.orderId).toBe("order-123");
    expect(record.fromState).toBe("initiated");
    expect(record.toState).toBe("pending_approval");
    expect(record.eventType).toBe("checkout_pending_approval");
    expect(snapshotWorkflowTransitionAudit()).toHaveLength(1);
  });

  it("rejects inserts without an order id", async () => {
    await expect(
      insertWorkflowTransitionAudit({
        orderId: "  ",
        fromState: null,
        toState: "completed",
        eventType: "checkout_completed",
      })
    ).rejects.toThrow("orderId is required");
  });
});
