import { http, HttpResponse } from "msw";
import type {
  CreateDelegationInput,
  Delegation,
  UpdateDelegationInput,
} from "@delegolabs/types";
import {
  buildDelegationList,
  delegationCreatedFrom,
  errorResponse,
  okResponse,
} from "../fixtures/delegations";
import { generateDemoWorld } from "../generateDemoWorld.mjs";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

let delegations =
  process.env.NEXT_PUBLIC_SEED_DEMO === "true"
    ? (generateDemoWorld().delegations as Delegation[])
    : buildDelegationList(5);

/** Reset in-memory fixture state between tests. */
export function resetDelegations(seedCount = 5) {
  delegations = buildDelegationList(seedCount);
}

/** Replace the in-memory list — used by `pnpm seed:demo` interop (#631). */
export function seedDelegations(next: Delegation[]) {
  delegations = next;
}

export const delegationHandlers = [
  http.get(`${BASE_URL}/delegations`, () => {
    return HttpResponse.json(okResponse(delegations));
  }),

  http.post(`${BASE_URL}/delegations`, async ({ request }) => {
    const input = (await request.json()) as CreateDelegationInput;
    const created = delegationCreatedFrom(input);
    delegations = [...delegations, created];
    return HttpResponse.json(okResponse(created), { status: 201 });
  }),

  http.patch(`${BASE_URL}/delegations/:id`, async ({ params, request }) => {
    const id = params.id as string;
    const input = (await request.json()) as UpdateDelegationInput;
    const existing = delegations.find((d) => d.id === id);
    if (!existing) {
      return HttpResponse.json(errorResponse("Delegation not found", "not_found"), {
        status: 404,
      });
    }
    const updated = {
      ...existing,
      status: input.status ?? existing.status,
      policy: {
        ...existing.policy,
        ...(input.policy?.maxPerTransaction !== undefined && {
          maxPerTransaction: BigInt(input.policy.maxPerTransaction),
        }),
        ...(input.policy?.maxTotal !== undefined && {
          maxTotal: BigInt(input.policy.maxTotal),
        }),
      },
      updatedAt: new Date(),
    };
    delegations = delegations.map((d) => (d.id === id ? updated : d));
    return HttpResponse.json(okResponse(updated));
  }),

  http.delete(`${BASE_URL}/delegations/:id`, ({ params }) => {
    const id = params.id as string;
    delegations = delegations.filter((d) => d.id !== id);
    return HttpResponse.json(okResponse({ id, status: "revoked" }));
  }),
];

/** Scenario variant: no delegations yet (FE-035 empty state). */
export const delegationHandlersEmpty = [
  http.get(`${BASE_URL}/delegations`, () => HttpResponse.json(okResponse([]))),
];

/** Scenario variant: gateway error. */
export const delegationHandlersError = [
  http.get(`${BASE_URL}/delegations`, () =>
    HttpResponse.json(errorResponse("Failed to load delegations"), { status: 500 })
  ),
];

/** Scenario variant: paginated-looking large list, for list-virtualization/perf states. */
export const delegationHandlersPaginated = [
  http.get(`${BASE_URL}/delegations`, () => HttpResponse.json(okResponse(buildDelegationList(50)))),
];
