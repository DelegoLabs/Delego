/**
 * Unit tests for #347 — workflow timeout detection and dead letter queue.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findStuckWorkflows,
  moveToDeadLetter,
  processTimedOutWorkflows,
  resetDeadLetterStore,
  listDeadLetterEntries,
  DEFAULT_TIMEOUT_MS,
  type DeadLetterStore,
  type DeadLetterEntry,
} from "./timeout.js";
import { InMemorySagaStore } from "../src/saga/memory-store.js";
import type { SagaRecord } from "../src/saga/types.js";

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<SagaRecord> = {}): SagaRecord {
  const now = new Date();
  return {
    sagaId: "saga-1",
    orderId: "order-1",
    status: "running",
    completedSteps: [],
    context: { userId: "usr-1" },
    currentStep: "fundEscrow",
    error: null,
    version: 1,
    claimExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Returns a Date that is `ms` milliseconds in the past. */
function pastDate(ms: number): Date {
  return new Date(Date.now() - ms);
}

// ─── findStuckWorkflows ───────────────────────────────────────────────────────

describe("findStuckWorkflows", () => {
  it("returns an empty array when no sagas exist", async () => {
    const store = new InMemorySagaStore();
    const stuck = await findStuckWorkflows(store);
    expect(stuck).toHaveLength(0);
  });

  it("identifies workflows whose updatedAt exceeds the timeout", async () => {
    const store = new InMemorySagaStore();
    const staleRecord = makeRecord({
      sagaId: "stale-1",
      updatedAt: pastDate(DEFAULT_TIMEOUT_MS + 1000),
    });
    await store.createIfNotExists(staleRecord);

    const stuck = await findStuckWorkflows(store, DEFAULT_TIMEOUT_MS);
    expect(stuck).toHaveLength(1);
    expect(stuck[0].sagaId).toBe("stale-1");
  });

  it("does not flag recently updated workflows as stuck", async () => {
    const store = new InMemorySagaStore();
    const freshRecord = makeRecord({
      sagaId: "fresh-1",
      updatedAt: new Date(), // just now
    });
    await store.createIfNotExists(freshRecord);

    const stuck = await findStuckWorkflows(store, DEFAULT_TIMEOUT_MS);
    expect(stuck).toHaveLength(0);
  });

  it("only includes running and compensating workflows, not completed/failed", async () => {
    const store = new InMemorySagaStore();
    const staleCompleted = makeRecord({
      sagaId: "done-1",
      status: "completed",
      updatedAt: pastDate(DEFAULT_TIMEOUT_MS + 5000),
    });
    await store.createIfNotExists(staleCompleted);

    // InMemorySagaStore.listIncomplete() filters to running/compensating only
    const stuck = await findStuckWorkflows(store, DEFAULT_TIMEOUT_MS);
    expect(stuck).toHaveLength(0);
  });
});

// ─── moveToDeadLetter ─────────────────────────────────────────────────────────

describe("moveToDeadLetter", () => {
  it("pushes the record into the DLQ with the supplied reason", async () => {
    const entries: DeadLetterEntry[] = [];
    const dlq: DeadLetterStore = {
      async push(e) { entries.push(e); },
      async list() { return entries; },
    };

    const record = makeRecord({ sagaId: "saga-dlq-1", orderId: "ord-dlq-1" });
    const entry = await moveToDeadLetter(record, "test reason", dlq);

    expect(entry.sagaId).toBe("saga-dlq-1");
    expect(entry.reason).toBe("test reason");
    expect(entries).toHaveLength(1);
  });
});

// ─── processTimedOutWorkflows ─────────────────────────────────────────────────

describe("processTimedOutWorkflows", () => {
  beforeEach(() => {
    resetDeadLetterStore();
  });

  it("returns empty results when no workflows are stuck", async () => {
    const store = new InMemorySagaStore();
    await store.createIfNotExists(makeRecord({ updatedAt: new Date() }));

    const result = await processTimedOutWorkflows(store, undefined, DEFAULT_TIMEOUT_MS);
    expect(result.compensated).toHaveLength(0);
    expect(result.movedToDlq).toHaveLength(0);
  });

  it("moves stuck workflows to DLQ when no tryCompensate callback is provided", async () => {
    const store = new InMemorySagaStore();
    await store.createIfNotExists(
      makeRecord({ sagaId: "stuck-1", updatedAt: pastDate(DEFAULT_TIMEOUT_MS + 1000) }),
    );

    const result = await processTimedOutWorkflows(store, undefined, DEFAULT_TIMEOUT_MS);
    expect(result.movedToDlq).toContain("stuck-1");
    expect(result.compensated).toHaveLength(0);

    const dlqEntries = await listDeadLetterEntries();
    expect(dlqEntries.some((e) => e.sagaId === "stuck-1")).toBe(true);
  });

  it("marks saga as compensated when tryCompensate returns true", async () => {
    const store = new InMemorySagaStore();
    await store.createIfNotExists(
      makeRecord({ sagaId: "stuck-2", updatedAt: pastDate(DEFAULT_TIMEOUT_MS + 1000) }),
    );

    const tryCompensate = vi.fn().mockResolvedValue(true);
    const result = await processTimedOutWorkflows(store, tryCompensate, DEFAULT_TIMEOUT_MS);

    expect(result.compensated).toContain("stuck-2");
    expect(result.movedToDlq).toHaveLength(0);
  });

  it("falls back to DLQ when tryCompensate returns false", async () => {
    const store = new InMemorySagaStore();
    await store.createIfNotExists(
      makeRecord({ sagaId: "stuck-3", updatedAt: pastDate(DEFAULT_TIMEOUT_MS + 1000) }),
    );

    const tryCompensate = vi.fn().mockResolvedValue(false);
    const result = await processTimedOutWorkflows(store, tryCompensate, DEFAULT_TIMEOUT_MS);

    expect(result.movedToDlq).toContain("stuck-3");
    expect(result.compensated).toHaveLength(0);
  });

  it("falls back to DLQ when tryCompensate throws", async () => {
    const store = new InMemorySagaStore();
    await store.createIfNotExists(
      makeRecord({ sagaId: "stuck-4", updatedAt: pastDate(DEFAULT_TIMEOUT_MS + 1000) }),
    );

    const tryCompensate = vi.fn().mockRejectedValue(new Error("compensation boom"));
    const result = await processTimedOutWorkflows(store, tryCompensate, DEFAULT_TIMEOUT_MS);

    expect(result.movedToDlq).toContain("stuck-4");
  });
});
