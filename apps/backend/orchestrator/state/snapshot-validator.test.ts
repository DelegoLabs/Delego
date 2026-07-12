import { describe, it, expect } from "vitest";
import {
  validateSnapshot,
  assertValidSnapshot,
  SNAPSHOT_VERSION,
} from "./snapshot-validator.js";
import type { WorkflowSnapshot } from "./types.js";

function validSnapshot(): WorkflowSnapshot {
  return {
    workflowId: "wf-1",
    currentState: "Discovery",
    context: {
      workflowId: "wf-1",
      delegationId: "del-1",
      userId: "usr-1",
      productId: null,
      merchantId: null,
      totalStroops: null,
      escrowContractId: null,
      rejectionReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    history: [],
    version: SNAPSHOT_VERSION,
  };
}

describe("validateSnapshot", () => {
  it("accepts a fully valid snapshot", () => {
    const result = validateSnapshot(validSnapshot());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects null", () => {
    const result = validateSnapshot(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/non-null object/);
  });

  it("rejects missing workflowId", () => {
    const snap = { ...validSnapshot(), workflowId: "" };
    const result = validateSnapshot(snap);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("workflowId"))).toBe(true);
  });

  it("rejects missing currentState", () => {
    const { currentState: _, ...snap } = validSnapshot();
    const result = validateSnapshot(snap);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("currentState"))).toBe(true);
  });

  it("rejects an unrecognised currentState value", () => {
    const snap = { ...validSnapshot(), currentState: "Bogus" };
    const result = validateSnapshot(snap);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("currentState"))).toBe(true);
  });

  it("rejects missing context", () => {
    const { context: _, ...snap } = validSnapshot();
    const result = validateSnapshot(snap);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("context"))).toBe(true);
  });

  it("rejects context missing required fields", () => {
    const snap = {
      ...validSnapshot(),
      context: { workflowId: "wf-1" }, // missing delegationId and userId
    };
    const result = validateSnapshot(snap);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("delegationId"))).toBe(true);
    expect(result.errors.some((e) => e.includes("userId"))).toBe(true);
  });

  it("rejects missing history", () => {
    const { history: _, ...snap } = validSnapshot();
    const result = validateSnapshot(snap);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("history"))).toBe(true);
  });

  it("rejects wrong version", () => {
    const snap = { ...validSnapshot(), version: 99 };
    const result = validateSnapshot(snap);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("version"))).toBe(true);
  });

  it("accumulates multiple errors", () => {
    const snap = { version: 99 }; // missing almost everything
    const result = validateSnapshot(snap);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe("assertValidSnapshot", () => {
  it("does not throw for a valid snapshot", () => {
    expect(() => assertValidSnapshot(validSnapshot())).not.toThrow();
  });

  it("throws with a descriptive message for an invalid snapshot", () => {
    expect(() => assertValidSnapshot({ version: 99 })).toThrowError(
      /quarantined/
    );
  });

  it("type-narrows the argument to WorkflowSnapshot after passing", () => {
    const raw: unknown = validSnapshot();
    assertValidSnapshot(raw);
    // TypeScript should now treat raw as WorkflowSnapshot
    expect(raw.workflowId).toBe("wf-1");
  });
});
