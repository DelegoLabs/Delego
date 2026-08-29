import { http, HttpResponse } from "msw";
import type { Order } from "@delegolabs/types";
import { buildOrder, okResponse } from "../fixtures/orders";
import { DUAL_CONTROL_THRESHOLD_STROOPS, DELEGATION_OWNERS } from "./orders";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

export { DUAL_CONTROL_THRESHOLD_STROOPS, DELEGATION_OWNERS };

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
