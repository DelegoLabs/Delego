/**
 * Unit tests for #341 — workflow compensation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runCompensation,
  type CompensationStep,
} from "./compensation.js";
import type { PurchaseContext } from "../../state/types.js";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../state/workflow-transition-audit.js", () => ({
  insertWorkflowTransitionAudit: vi.fn().mockResolvedValue({}),
}));

import { insertWorkflowTransitionAudit } from "../../state/workflow-transition-audit.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<PurchaseContext> = {}): PurchaseContext {
  const now = new Date();
  return {
    workflowId: "wf-test",
    delegationId: "del-1",
    userId: "usr-1",
    productId: "prod-1",
    merchantId: "merch-1",
    totalStroops: BigInt(1000),
    escrowContractId: "escrow-1",
    rejectionReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const steps: CompensationStep[] = [
  {
    name: "fundEscrow",
    async compensate(ctx) {
      return { ...ctx, escrowContractId: null };
    },
  },
  {
    name: "confirmPurchase",
    async compensate(ctx) {
      return ctx;
    },
  },
  {
    name: "settleEscrow",
    async compensate(ctx) {
      return ctx;
    },
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runCompensation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("compensates completed steps in reverse order", async () => {
    const order: string[] = [];
    const trackedSteps: CompensationStep[] = steps.map((s) => ({
      ...s,
      async compensate(ctx, cause) {
        order.push(s.name);
        return s.compensate(ctx, cause);
      },
    }));

    const completedSteps = ["fundEscrow", "confirmPurchase"];
    const ctx = makeContext();
    const cause = new Error("settlement failed");

    const result = await runCompensation("wf-test", completedSteps, ctx, cause, trackedSteps);

    // Should run in reverse: confirmPurchase first, then fundEscrow
    expect(order).toEqual(["confirmPurchase", "fundEscrow"]);
    expect(result.status).toBe("success");
    expect(result.compensatedSteps).toEqual(["confirmPurchase", "fundEscrow"]);
    expect(result.failedSteps).toHaveLength(0);
  });

  it("marks status as partial_failure when a compensation step throws", async () => {
    const failingSteps: CompensationStep[] = [
      {
        name: "fundEscrow",
        async compensate() {
          throw new Error("release failed");
        },
      },
      {
        name: "confirmPurchase",
        async compensate(ctx) {
          return ctx;
        },
      },
    ];

    const ctx = makeContext();
    const cause = new Error("settle failed");

    const result = await runCompensation(
      "wf-test",
      ["fundEscrow", "confirmPurchase"],
      ctx,
      cause,
      failingSteps,
    );

    expect(result.status).toBe("partial_failure");
    expect(result.failedSteps.some((f) => f.step === "fundEscrow")).toBe(true);
    expect(result.compensatedSteps).toContain("confirmPurchase");
  });

  it("writes an audit record for each successfully compensated step", async () => {
    const ctx = makeContext();
    const cause = new Error("escrow failed");

    await runCompensation("wf-test", ["fundEscrow"], ctx, cause, steps);

    expect(insertWorkflowTransitionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "wf-test",
        toState: "fundEscrow_compensated",
        eventType: "COMPENSATION",
      }),
    );
  });

  it("reports a missing compensator as a failed step rather than throwing", async () => {
    const ctx = makeContext();
    const cause = new Error("boom");

    const result = await runCompensation(
      "wf-test",
      ["unknownStep"],
      ctx,
      cause,
      steps,
    );

    expect(result.failedSteps[0]?.step).toBe("unknownStep");
    expect(result.failedSteps[0]?.error).toMatch(/No compensator/);
  });

  it("returns an empty compensatedSteps list when completedSteps is empty", async () => {
    const ctx = makeContext();
    const cause = new Error("nothing to compensate");

    const result = await runCompensation("wf-test", [], ctx, cause, steps);

    expect(result.compensatedSteps).toHaveLength(0);
    expect(result.status).toBe("success");
  });
});
