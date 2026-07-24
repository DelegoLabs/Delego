import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => {
  return { mockQuery: vi.fn() };
});

vi.mock("pg", () => {
  return {
    Pool: vi.fn().mockImplementation(() => ({
      query: mockQuery,
      end: vi.fn(),
    })),
  };
});

import {
  persistWorkflowState,
  recoverWorkflowState,
  recoverUnfinishedWorkflows,
} from "./index.js";

describe("Workflow State Persistence (Issue #54)", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("persists state correctly on workflow transition (insert path)", async () => {
    const orderId = "ord-123";
    const state = "SEARCHING";
    const context = { userId: "usr-456", query: "laptop" };

    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          order_id: orderId,
          user_id: "usr-456",
          state,
          context,
          version: 1,
          updated_at: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    });

    const result = await persistWorkflowState(orderId, state, context);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      orderId: "ord-123",
      userId: "usr-456",
      state: "SEARCHING",
      context: { userId: "usr-456", query: "laptop" },
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("handles optimistic versioning when updating existing workflow", async () => {
    const orderId = "ord-123";
    const state = "APPROVED";
    const context = { userId: "usr-456", selectedProductId: "p-1" };

    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          order_id: orderId,
          user_id: "usr-456",
          state,
          context,
          version: 2,
          updated_at: new Date("2026-01-01T00:05:00Z"),
        },
      ],
    });

    const result = await persistWorkflowState(orderId, state, context, 1);

    expect(result.version).toBe(2);
    expect(result.state).toBe("APPROVED");
  });

  it("throws optimistic locking conflict error when concurrent update occurs", async () => {
    const orderId = "ord-123";
    const state = "APPROVED";
    const context = { userId: "usr-456" };

    // UPDATE query returns 0 rows updated
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    // Check query finds row with higher version
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ version: 3 }] });

    await expect(
      persistWorkflowState(orderId, state, context, 1)
    ).rejects.toThrow("Optimistic locking conflict");
  });

  it("recovers workflow state for given orderId", async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          order_id: "ord-999",
          user_id: "usr-777",
          state: "ESCROW_FUNDED",
          context: { escrowId: "escrow-1" },
          version: 3,
          updated_at: new Date("2026-01-01T00:10:00Z"),
        },
      ],
    });

    const recovered = await recoverWorkflowState("ord-999");
    expect(recovered).toEqual({
      orderId: "ord-999",
      userId: "usr-777",
      state: "ESCROW_FUNDED",
      context: { escrowId: "escrow-1" },
      version: 3,
      updatedAt: "2026-01-01T00:10:00.000Z",
    });
  });

  it("recovers unfinished workflows during startup", async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 2,
      rows: [
        {
          order_id: "ord-1",
          user_id: "usr-1",
          state: "SEARCHING",
          context: {},
          version: 1,
          updated_at: new Date("2026-01-01T00:00:00Z"),
        },
        {
          order_id: "ord-2",
          user_id: "usr-2",
          state: "APPROVED",
          context: {},
          version: 2,
          updated_at: new Date("2026-01-01T00:02:00Z"),
        },
      ],
    });

    const unfinished = await recoverUnfinishedWorkflows();
    expect(unfinished.length).toBe(2);
    expect(unfinished[0].orderId).toBe("ord-1");
    expect(unfinished[1].orderId).toBe("ord-2");
  });
});
