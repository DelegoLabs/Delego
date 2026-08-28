import { http, HttpResponse } from "msw";
import type { Escrow } from "@delegolabs/types";
import { buildEscrowList, errorResponse, okResponse } from "../fixtures/escrows";
import { generateDemoWorld } from "../generateDemoWorld.mjs";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

let escrows =
  process.env.NEXT_PUBLIC_SEED_DEMO === "true"
    ? (generateDemoWorld().escrows as unknown as Escrow[])
    : buildEscrowList(5);

/** Replace the in-memory list — used by `pnpm seed:demo` interop (#631). */
export function seedEscrows(next: Escrow[]) {
  escrows = next;
}

export function resetEscrows() {
  escrows = buildEscrowList(5);
}

export const escrowHandlers = [
  http.get(`${BASE_URL}/escrows`, () => {
    return HttpResponse.json(okResponse(escrows));
  }),
];

/** Scenario variant: no escrows yet (FE-035 empty state). */
export const escrowHandlersEmpty = [
  http.get(`${BASE_URL}/escrows`, () => HttpResponse.json(okResponse([]))),
];

/** Scenario variant: gateway error. */
export const escrowHandlersError = [
  http.get(`${BASE_URL}/escrows`, () =>
    HttpResponse.json(errorResponse("Failed to load escrows"), { status: 500 })
  ),
];

/** Scenario variant: paginated-looking large list. */
export const escrowHandlersPaginated = [
  http.get(`${BASE_URL}/escrows`, () => HttpResponse.json(okResponse(buildEscrowList(50)))),
];
