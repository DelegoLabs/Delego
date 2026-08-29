import { http, HttpResponse } from "msw";
import type { ErasureRequest } from "@delegolabs/types";
import { okResponse, errorResponse } from "../fixtures/orders";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

/** Mock mirror of the server-side erasure cooldown (#610). */
export const ERASURE_COOLDOWN_DAYS = 30;

let currentRequest: ErasureRequest | null = null;

/** Reset in-memory erasure fixture state between tests. */
export function resetErasureRequest() {
  currentRequest = null;
}

function buildRequest(): ErasureRequest {
  const now = new Date();
  const finalizesAt = new Date(now);
  finalizesAt.setDate(finalizesAt.getDate() + ERASURE_COOLDOWN_DAYS);
  return {
    requestedAt: now.toISOString(),
    finalizesAt: finalizesAt.toISOString(),
    serverTimestamp: now.toISOString(),
    status: "pending",
  };
}

export const erasureHandlers = [
  http.post(`${BASE_URL}/account/erasure`, () => {
    currentRequest = buildRequest();
    return HttpResponse.json(okResponse(currentRequest));
  }),

  http.post(`${BASE_URL}/account/erasure/cancel`, () => {
    if (!currentRequest || currentRequest.status !== "pending") {
      return HttpResponse.json(
        errorResponse("No pending erasure request to cancel", "not_found"),
        { status: 404 }
      );
    }
    currentRequest = { ...currentRequest, status: "cancelled" };
    return HttpResponse.json(okResponse(currentRequest));
  }),
];
