import { http, HttpResponse } from "msw";
import type { Order } from "@delegolabs/types";
import { buildOrder, okResponse } from "../fixtures/orders";
import { DUAL_CONTROL_THRESHOLD_STROOPS, DELEGATION_OWNERS } from "./orders";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

export { DUAL_CONTROL_THRESHOLD_STROOPS, DELEGATION_OWNERS };

/** Wire shape of a queue row (#780) — same contract as `PendingApprovalDto`. */
export interface PendingApprovalFixture {
  orderId: string;
  requestedBy: string;
  amountStroops: string;
  recipient: string;
  expiresAt: string;
}

function inHours(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

/** Two live rows (one urgent) plus one already expired, so every tone renders. */
export function buildPendingApprovalFixtures(): PendingApprovalFixture[] {
  return [
    {
      orderId: "order-pending-1",
      requestedBy: DELEGATION_OWNERS[0],
      amountStroops: "75000000000",
      recipient: "GBUYER-RECIPIENT-000000000000000000000001",
      expiresAt: inHours(2),
    },
    {
      orderId: "order-pending-2",
      requestedBy: DELEGATION_OWNERS[1],
      amountStroops: "125000000000",
      recipient: "GBUYER-RECIPIENT-000000000000000000000002",
      expiresAt: inHours(48),
    },
    {
      orderId: "order-pending-expired",
      requestedBy: DELEGATION_OWNERS[2],
      amountStroops: "9000000000",
      recipient: "GBUYER-RECIPIENT-000000000000000000000003",
      expiresAt: inHours(-1),
    },
  ];
}

let pendingApprovals = buildPendingApprovalFixtures();

/** Reset the in-memory queue between tests. */
export function resetPendingApprovals() {
  pendingApprovals = buildPendingApprovalFixtures();
}

/** Replace the queue wholesale — e.g. from the seeded demo world. */
export function seedPendingApprovals(next: PendingApprovalFixture[]) {
  pendingApprovals = next;
}

/**
 * The multi-sig approval queue (#780): transactions awaiting a secondary
 * signature. Signing one through `POST /orders/:id/approve` removes it from
 * the queue, mirroring the server.
 */
export const pendingApprovalHandlers = [
  http.get(`${BASE_URL}/orders/approvals/pending`, () =>
    HttpResponse.json(okResponse(pendingApprovals))
  ),
];

/** Scenario variant: nothing is waiting on a signature. */
export const pendingApprovalHandlersEmpty = [
  http.get(`${BASE_URL}/orders/approvals/pending`, () =>
    HttpResponse.json(okResponse([] as PendingApprovalFixture[]))
  ),
];

/**
 * A high-value order fixture that requires dual control under the mock
 * threshold (#574). Seed it into the shared order store via
 * `seedOrder` (from `./orders`) before driving the two-approver journey
 * through `POST /orders/:id/approve`.
 */
export function buildDualControlOrder(seed = 1, overrides: Partial<Order> = {}): Order {
  return buildOrder(seed, {
    status: "pending_approval",
    totalStroops: DUAL_CONTROL_THRESHOLD_STROOPS * 2n,
    ...overrides,
  });
}

/** Capability probe (#574, #573, #610): API advertises dual-control, approval-note, and data-erasure support. */
export const capabilitiesHandlers = [
  http.get(`${BASE_URL}/capabilities`, () =>
    HttpResponse.json(
      okResponse({
        dualControlApprovals: true,
        approvalNoteSupported: true,
        dataErasureRequestSupported: true,
      })
    )
  ),
];

/** Scenario variant: API is on an older version without dual-control support. */
export const capabilitiesHandlersDisabled = [
  http.get(`${BASE_URL}/capabilities`, () =>
    HttpResponse.json(
      okResponse({
        dualControlApprovals: false,
        approvalNoteSupported: false,
        dataErasureRequestSupported: false,
      })
    )
  ),
];

/** Scenario variant: capability probe itself is unavailable — callers must fall back. */
export const capabilitiesHandlersUnavailable = [
  http.get(`${BASE_URL}/capabilities`, () => new HttpResponse(null, { status: 404 })),
];

/** Scenario variant (#573): dual-control is on, but the API rejects `approvalNote` — notes must stay local-only. */
export const capabilitiesHandlersApprovalNoteUnsupported = [
  http.get(`${BASE_URL}/capabilities`, () =>
    HttpResponse.json(
      okResponse({ dualControlApprovals: true, approvalNoteSupported: false })
    )
  ),
];

/** Scenario variant (#610): the API doesn't advertise data-erasure support — the server tier should hide entirely. */
export const capabilitiesHandlersErasureUnsupported = [
  http.get(`${BASE_URL}/capabilities`, () =>
    HttpResponse.json(
      okResponse({
        dualControlApprovals: true,
        approvalNoteSupported: true,
        dataErasureRequestSupported: false,
      })
    )
  ),
];
