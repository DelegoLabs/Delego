import { http, HttpResponse } from "msw";
import type { Order } from "@delegolabs/types";
import { buildOrderList, errorResponse, okResponse } from "../fixtures/orders";
import { generateDemoWorld } from "../generateDemoWorld.mjs";
import {
  applyFirstApproval,
  applySecondApproval,
  canCountersign,
  SELF_COUNTERSIGN_MESSAGE,
} from "../../lib/dualControl";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

/** Mock mirror of the dual-control threshold (#574) — orders at/above this require a countersignature. */
export const DUAL_CONTROL_THRESHOLD_STROOPS = 5_000n * 10_000_000n;

/** Mock delegation owner list authorized to countersign. */
export const DELEGATION_OWNERS = ["wallet-owner-a", "wallet-owner-b", "wallet-owner-c"];

let orders =
  process.env.NEXT_PUBLIC_SEED_DEMO === "true"
    ? (generateDemoWorld().orders as unknown as Order[])
    : buildOrderList(5);

/** Reset in-memory fixture state between tests. */
export function resetOrders(seedCount = 5) {
  orders = buildOrderList(seedCount);
}

/** Replace the in-memory list — used by `pnpm seed:demo` interop (#631). */
export function seedOrders(next: Order[]) {
  orders = next;
}

/** Upserts a single order into the fixture store — e.g. to seed a specific dual-control scenario. */
export function seedOrder(order: Order) {
  orders = [...orders.filter((o) => o.id !== order.id), order];
}

function requiresDualControl(order: Order): boolean {
  return (order.totalStroops ?? 0n) >= DUAL_CONTROL_THRESHOLD_STROOPS;
}

export const orderHandlers = [
  http.get(`${BASE_URL}/orders`, () => {
    return HttpResponse.json(okResponse(orders));
  }),

  /**
   * Dual-control-aware approve (#574): a request with no `approverAddress`
   * body behaves exactly as before (immediate approval) — that's the path
   * every existing caller and test already exercises. Only a high-value
   * order (>= DUAL_CONTROL_THRESHOLD_STROOPS) approved *with* an
   * `approverAddress` engages the two-signer state machine, demonstrating
   * the full journey: first approval -> awaiting_countersign -> a second,
   * different signer completes it; the same signer trying again is
   * rejected 409, mirroring the client-side self-countersign guard.
   */
  http.post(`${BASE_URL}/orders/:id/approve`, async ({ params, request }) => {
    const id = params.id as string;
    const body = (await request.json().catch(() => ({}))) as { approverAddress?: string };
    const approverAddress = body?.approverAddress;

    const existing = orders.find((o) => o.id === id);
    if (!existing) {
      return HttpResponse.json(errorResponse("Order not found", "not_found"), { status: 404 });
    }

    if (!requiresDualControl(existing) || !approverAddress) {
      const updated = { ...existing, status: "approved" as const, updatedAt: new Date() };
      orders = orders.map((o) => (o.id === id ? updated : o));
      return HttpResponse.json(okResponse(updated));
    }

    const now = new Date().toISOString();

    if (!existing.dualControl || existing.dualControl.status === "single") {
      const dualControl = applyFirstApproval(approverAddress, approverAddress, now, DELEGATION_OWNERS);
      const updated: Order = { ...existing, dualControl, updatedAt: new Date() };
      orders = orders.map((o) => (o.id === id ? updated : o));
      return HttpResponse.json(okResponse(updated));
    }

    if (existing.dualControl.status === "awaiting_countersign") {
      const check = canCountersign(existing.dualControl, approverAddress);
      if (!check.allowed) {
        return HttpResponse.json(
          errorResponse(check.reason ?? SELF_COUNTERSIGN_MESSAGE, "self_countersign_blocked"),
          { status: 409 }
        );
      }
      const dualControl = applySecondApproval(existing.dualControl, approverAddress, approverAddress, now);
      const updated: Order = { ...existing, status: "approved", dualControl, updatedAt: new Date() };
      orders = orders.map((o) => (o.id === id ? updated : o));
      return HttpResponse.json(okResponse(updated));
    }

    // Already completed — idempotent no-op.
    return HttpResponse.json(okResponse(existing));
  }),

  http.post(`${BASE_URL}/orders/:id/reject`, ({ params }) => {
    const id = params.id as string;
    const existing = orders.find((o) => o.id === id);
    if (!existing) {
      return HttpResponse.json(errorResponse("Order not found", "not_found"), { status: 404 });
    }
    const updated = { ...existing, status: "cancelled" as const, updatedAt: new Date() };
    orders = orders.map((o) => (o.id === id ? updated : o));
    return HttpResponse.json(okResponse(updated));
  }),
];

/** Scenario variant: no orders yet (FE-035 empty state). */
export const orderHandlersEmpty = [
  http.get(`${BASE_URL}/orders`, () => HttpResponse.json(okResponse([]))),
];

/** Scenario variant: gateway error. */
export const orderHandlersError = [
  http.get(`${BASE_URL}/orders`, () =>
    HttpResponse.json(errorResponse("Failed to load orders"), { status: 500 })
  ),
];

/** Scenario variant: paginated-looking large list. */
export const orderHandlersPaginated = [
  http.get(`${BASE_URL}/orders`, () => HttpResponse.json(okResponse(buildOrderList(50)))),
];
