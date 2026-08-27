import { http, HttpResponse } from "msw";
import type { CreateDisputeInput, Dispute } from "@delegolabs/types";
import { buildDispute, errorResponse, okResponse } from "../fixtures/disputes";
import { buildEscrowList } from "../fixtures/escrows";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

/** escrowId -> current dispute, reset between test runs via resetDisputes(). */
let disputesByEscrowId = new Map<string, Dispute>();

/** Reset in-memory fixture state between tests. */
export function resetDisputes() {
  disputesByEscrowId = new Map();
}

export const disputeHandlers = [
  http.get(`${BASE_URL}/escrows/:id/disputes/current`, ({ params }) => {
    const escrowId = params.id as string;
    return HttpResponse.json(okResponse(disputesByEscrowId.get(escrowId) ?? null));
  }),

  http.post(`${BASE_URL}/escrows/:id/disputes`, async ({ params, request }) => {
    const escrowId = params.id as string;
    const existing = disputesByEscrowId.get(escrowId);
    if (existing && existing.status === "open") {
      return HttpResponse.json(
        errorResponse("This escrow already has an open dispute", "dispute_already_open"),
        { status: 409 }
      );
    }

    const input = (await request.json()) as CreateDisputeInput;
    if (!input.description || input.description.trim().length === 0) {
      return HttpResponse.json(errorResponse("Description is required", "invalid_input"), {
        status: 400,
      });
    }

    // Fixture escrows carry a stable orderId derived from the same seed.
    const escrow = buildEscrowList(50).find((e) => e.escrowId === escrowId);
    const dispute = buildDispute(escrowId, escrow?.orderId ?? "unknown-order", input);
    disputesByEscrowId.set(escrowId, dispute);
    return HttpResponse.json(okResponse(dispute));
  }),
];

/** Scenario variant: dispute submission always rejected (unauthorized submitter). */
export const disputeHandlersUnauthorized = [
  http.post(`${BASE_URL}/escrows/:id/disputes`, () =>
    HttpResponse.json(
      errorResponse("Not authorized to open a dispute for this escrow", "forbidden"),
      { status: 403 }
    )
  ),
];
