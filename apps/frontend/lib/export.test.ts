import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetOrders = vi.fn();
const mockGetDelegations = vi.fn();

vi.mock("./api", () => ({
  api: {
    getOrders: (...args: unknown[]) => mockGetOrders(...args),
    getDelegations: (...args: unknown[]) => mockGetDelegations(...args),
  },
}));

const { buildAccountExport } = await import("./export");

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    stellarAddress: "GABC...",
    displayName: "Ada",
    email: "ada@example.com",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function makePreferences(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    defaultSpendingLimit: 500_0000000n,
    requireApproval: true,
    notificationEmail: true,
    notificationPush: false,
    ...overrides,
  };
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    userId: "user-1",
    delegationId: "del-1",
    merchantId: "merchant-1",
    status: "settled",
    lineItems: [],
    totalStroops: 10_000_000_000n,
    escrowContractId: null,
    createdAt: new Date("2026-01-03T00:00:00.000Z"),
    updatedAt: new Date("2026-01-04T00:00:00.000Z"),
    ...overrides,
  };
}

function makeDelegation(overrides: Record<string, unknown> = {}) {
  return {
    id: "del-1",
    userId: "user-1",
    agentId: "agent-1",
    status: "active",
    policy: {
      maxPerTransaction: 1_000_0000000n,
      maxTotal: 10_000_0000000n,
      allowedMerchants: ["merchant-1"],
      expiresAt: null,
    },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("buildAccountExport", () => {
  beforeEach(() => {
    mockGetOrders.mockReset();
    mockGetDelegations.mockReset();
  });

  it("assembles a JSON envelope with profile, delegations, orders, and derived decisions", async () => {
    mockGetDelegations.mockResolvedValue({ data: [makeDelegation()] });
    mockGetOrders.mockResolvedValue({
      data: [
        makeOrder({ id: "order-approved", status: "settled" }),
        makeOrder({ id: "order-rejected", status: "cancelled" }),
        makeOrder({ id: "order-pending", status: "pending_approval" }),
      ],
    });

    const blob = await buildAccountExport(makeUser() as any, makePreferences() as any);
    const envelope = JSON.parse(await blob.text());

    expect(envelope.appVersion).toEqual(expect.any(String));
    expect(new Date(envelope.generatedAt).toString()).not.toBe("Invalid Date");
    expect(envelope.account.profile).toMatchObject({
      id: "user-1",
      stellarAddress: "GABC...",
    });
    expect(envelope.account.preferences.defaultSpendingLimitStroops).toBe(
      "5000000000"
    );
    expect(envelope.delegations).toHaveLength(1);
    expect(envelope.delegations[0].policy.maxTotalStroops).toBe("100000000000");
    expect(envelope.orders).toHaveLength(3);
    expect(envelope.approvalDecisions).toEqual([
      expect.objectContaining({
        orderId: "order-approved",
        decision: "approved",
      }),
      expect.objectContaining({
        orderId: "order-rejected",
        decision: "rejected",
      }),
    ]);
  });

  it("produces valid JSON for a large history without blowing up", async () => {
    mockGetDelegations.mockResolvedValue({ data: [] });
    const orders = Array.from({ length: 450 }, (_, i) =>
      makeOrder({ id: `order-${i}`, status: "settled" })
    );
    mockGetOrders.mockResolvedValue({ data: orders });

    const progressPhases: string[] = [];
    const blob = await buildAccountExport(makeUser() as any, makePreferences() as any, {
      onProgress: (p) => progressPhases.push(p.phase),
    });
    const envelope = JSON.parse(await blob.text());

    expect(envelope.orders).toHaveLength(450);
    expect(envelope.approvalDecisions).toHaveLength(450);
    // More than one batch (BATCH_SIZE=200) means progress fired more than once per phase.
    expect(
      progressPhases.filter((p) => p === "assembling-orders").length
    ).toBeGreaterThan(1);
  });

  it("aborts when the signal is already cancelled", async () => {
    mockGetDelegations.mockResolvedValue({ data: [] });
    mockGetOrders.mockResolvedValue({ data: [] });
    const controller = new AbortController();
    controller.abort();

    await expect(
      buildAccountExport(makeUser() as any, makePreferences() as any, {
        signal: controller.signal,
      })
    ).rejects.toThrow();
  });
});
