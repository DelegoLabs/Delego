import { describe, it, expect, afterEach } from "vitest";
import {
  generateDemoWorld,
  serializeDemoWorld,
  UI_STATE_COVERAGE,
} from "./demoWorld";
import { applyDemoWorld, resetDelegations, resetOrders, resetDisputes, resetEscrows } from "./handlers";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

describe("seeded demo world (#631)", () => {
  afterEach(() => {
    resetDelegations();
    resetOrders();
    resetDisputes();
    resetEscrows();
  });
  it("two fresh runs produce byte-identical exports", () => {
    const a = serializeDemoWorld(generateDemoWorld());
    const b = serializeDemoWorld(generateDemoWorld());
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(100);
  });

  it("covers the documented entity status classes and list matrices", () => {
    const world = generateDemoWorld();
    expect(world.agents).toHaveLength(3);
    expect(world.delegations).toHaveLength(6);
    expect(world.orders).toHaveLength(40);
    expect(world.escrows).toHaveLength(6);
    expect(world.disputes).toHaveLength(1);
    expect(world.notifications.length).toBeGreaterThan(0);

    const statusOf = (row: Record<string, unknown>) => String(row.status);
    const delegationStatuses = new Set(world.delegations.map(statusOf));
    for (const status of UI_STATE_COVERAGE.entityStatuses.delegations) {
      expect(delegationStatuses.has(status)).toBe(true);
    }
    const orderStatuses = new Set(world.orders.map(statusOf));
    for (const status of UI_STATE_COVERAGE.entityStatuses.orders) {
      expect(orderStatuses.has(status)).toBe(true);
    }
    const escrowStatuses = new Set(world.escrows.map(statusOf));
    for (const status of UI_STATE_COVERAGE.entityStatuses.escrows) {
      expect(escrowStatuses.has(status)).toBe(true);
    }
    expect(UI_STATE_COVERAGE.listMatrices.empty.length).toBeGreaterThan(0);
    expect(UI_STATE_COVERAGE.listMatrices.error.length).toBeGreaterThan(0);
  });

  it("is consumed by the existing MSW handler suite", async () => {
    resetDelegations();
    resetOrders();
    resetDisputes();
    const world = applyDemoWorld();

    const res = await fetch(`${BASE_URL}/delegations`);
    const body = (await res.json()) as { data: Array<{ id: string }> };
    expect(body.data).toHaveLength(6);
    expect(body.data.map((d) => d.id)).toEqual(
      world.delegations.map((d) => String(d.id))
    );

    const ordersRes = await fetch(`${BASE_URL}/orders`);
    const ordersBody = (await ordersRes.json()) as { data: unknown[] };
    expect(ordersBody.data).toHaveLength(40);
  });
});
