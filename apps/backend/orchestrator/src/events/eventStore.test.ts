/**
 * Tests for Workflow Event Sourcing and Replay (Issue #354).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryWorkflowEventStore,
  createWorkflowEventRecord,
  recordWorkflowEvent,
  replayWorkflowEvents,
  cleanupOldEvents,
  setWorkflowEventStore,
  getWorkflowEventStore,
} from "./eventStore.js";

describe("WorkflowEventStore", () => {
  let store: InMemoryWorkflowEventStore;

  beforeEach(() => {
    store = new InMemoryWorkflowEventStore();
    setWorkflowEventStore(store);
  });

  afterEach(() => {
    setWorkflowEventStore(new InMemoryWorkflowEventStore());
  });

  describe("record", () => {
    it("stores events with auto-generated ID", async () => {
      const record = createWorkflowEventRecord({
        workflowId: "wf-1",
        eventType: "PRODUCT_FOUND",
        payload: { type: "PRODUCT_FOUND", productId: "p1", merchantId: "m1", totalStroops: 1000n },
        fromState: "Discovery",
        toState: "SpendingCheck",
      });

      await store.record(record);

      const events = await store.getEvents("wf-1");
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe(record.id);
      expect(events[0].workflowId).toBe("wf-1");
      expect(events[0].eventType).toBe("PRODUCT_FOUND");
    });
  });

  describe("getEvents", () => {
    it("returns events ordered by recordedAt", async () => {
      const now = new Date();
      await store.record(createWorkflowEventRecord({
        workflowId: "wf-1",
        eventType: "PRODUCT_FOUND",
        payload: { type: "PRODUCT_FOUND", productId: "p1", merchantId: "m1", totalStroops: 1000n },
        fromState: "Discovery",
        toState: "SpendingCheck",
      }));

      await store.record(createWorkflowEventRecord({
        workflowId: "wf-1",
        eventType: "SPEND_APPROVED",
        payload: { type: "SPEND_APPROVED" },
        fromState: "SpendingCheck",
        toState: "UserApprovalPending",
      }));

      const events = await store.getEvents("wf-1");
      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe("PRODUCT_FOUND");
      expect(events[1].eventType).toBe("SPEND_APPROVED");
    });

    it("returns empty array for unknown workflow", async () => {
      const events = await store.getEvents("unknown");
      expect(events).toHaveLength(0);
    });
  });

  describe("stats", () => {
    it("tracks total events and workflows", async () => {
      await store.record(createWorkflowEventRecord({
        workflowId: "wf-1",
        eventType: "PRODUCT_FOUND",
        payload: { type: "PRODUCT_FOUND", productId: "p1", merchantId: "m1", totalStroops: 1000n },
        fromState: "Discovery",
        toState: "SpendingCheck",
      }));

      await store.record(createWorkflowEventRecord({
        workflowId: "wf-2",
        eventType: "USER_APPROVED",
        payload: { type: "USER_APPROVED" },
        fromState: "UserApprovalPending",
        toState: "EscrowLocking",
      }));

      const stats = await store.stats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.workflowsTracked).toBe(2);
      expect(stats.oldestEvent).toBeInstanceOf(Date);
      expect(stats.newestEvent).toBeInstanceOf(Date);
    });
  });

  describe("cleanup", () => {
    it("removes events older than cutoff", async () => {
      const oldRecord = createWorkflowEventRecord({
        workflowId: "wf-1",
        eventType: "PRODUCT_FOUND",
        payload: { type: "PRODUCT_FOUND", productId: "p1", merchantId: "m1", totalStroops: 1000n },
        fromState: "Discovery",
        toState: "SpendingCheck",
      });
      // Simulate old event
      oldRecord.recordedAt = new Date(Date.now() - 60 * 60 * 1000);
      await store.record(oldRecord);

      await store.record(createWorkflowEventRecord({
        workflowId: "wf-1",
        eventType: "SPEND_APPROVED",
        payload: { type: "SPEND_APPROVED" },
        fromState: "SpendingCheck",
        toState: "UserApprovalPending",
      }));

      const removed = await store.cleanup(new Date());
      expect(removed).toBe(1);

      const remaining = await store.getEvents("wf-1");
      expect(remaining).toHaveLength(1);
    });
  });
});

describe("replayWorkflowEvents", () => {
  it("reconstructs state from event sequence", async () => {
    const store = new InMemoryWorkflowEventStore();
    setWorkflowEventStore(store);

    const events = [
      createWorkflowEventRecord({
        workflowId: "wf-replay",
        eventType: "PRODUCT_FOUND",
        payload: { type: "PRODUCT_FOUND", productId: "p1", merchantId: "m1", totalStroops: 5000n },
        fromState: "Discovery",
        toState: "SpendingCheck",
      }),
      createWorkflowEventRecord({
        workflowId: "wf-replay",
        eventType: "SPEND_APPROVED",
        payload: { type: "SPEND_APPROVED" },
        fromState: "SpendingCheck",
        toState: "UserApprovalPending",
      }),
      createWorkflowEventRecord({
        workflowId: "wf-replay",
        eventType: "USER_APPROVED",
        payload: { type: "USER_APPROVED" },
        fromState: "UserApprovalPending",
        toState: "EscrowLocking",
      }),
    ];

    const snapshot = await replayWorkflowEvents(events, {
      workflowId: "wf-replay",
      delegationId: "d1",
      userId: "u1",
    });

    expect(snapshot.currentState).toBe("EscrowLocking");
    expect(snapshot.history).toHaveLength(3);
    expect(snapshot.context.productId).toBe("p1");
    expect(snapshot.context.merchantId).toBe("m1");
  });

  it("throws for empty events", async () => {
    await expect(
      replayWorkflowEvents([], { workflowId: "wf-empty", delegationId: "d1", userId: "u1" })
    ).rejects.toThrow("No events to replay");
  });
});

describe("recordWorkflowEvent", () => {
  it("creates and stores event via global store", async () => {
    const store = new InMemoryWorkflowEventStore();
    setWorkflowEventStore(store);

    const record = await recordWorkflowEvent({
      workflowId: "wf-rec",
      eventType: "DELIVERY_VERIFIED",
      payload: { type: "DELIVERY_VERIFIED" },
      fromState: "DeliveryVerification",
      toState: "Completed",
      metadata: { source: "test" },
    });

    expect(record.id).toMatch(/^evt_/);
    expect(record.workflowId).toBe("wf-rec");
    expect(record.metadata.source).toBe("test");

    const stored = await store.getEvents("wf-rec");
    expect(stored).toHaveLength(1);
  });
});

describe("cleanupOldEvents", () => {
  it("removes events older than retention period", async () => {
    const store = new InMemoryWorkflowEventStore();
    setWorkflowEventStore(store);

    await store.record(createWorkflowEventRecord({
      workflowId: "wf-cleanup",
      eventType: "PRODUCT_FOUND",
      payload: { type: "PRODUCT_FOUND", productId: "p1", merchantId: "m1", totalStroops: 1000n },
      fromState: "Discovery",
      toState: "SpendingCheck",
    }));

    // Use 0 day retention to clean everything
    const removed = await cleanupOldEvents(0);
    expect(removed).toBe(1);
  });
});
