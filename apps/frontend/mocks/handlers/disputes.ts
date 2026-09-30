import { http, HttpResponse } from "msw";

import { buildDispute, errorResponse, okResponse } from "../fixtures/disputes";
import { buildEscrowList } from "../fixtures/escrows";
import { generateDemoWorld } from "../generateDemoWorld.mjs";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com";

/** escrowId -> current dispute, reset between test runs via resetDisputes(). */
let disputesByEscrowId = new Map<string, any>();

if (process.env.NEXT_PUBLIC_SEED_DEMO === "true") {
  for (const dispute of generateDemoWorld().disputes as any[]) {
    disputesByEscrowId.set(dispute.escrowId, dispute);
  }
}

/** Reset in-memory fixture state between tests. */
export function resetDisputes() {
  disputesByEscrowId = new Map();
}

/** Seed disputes from the demo world (#631). */
export function seedDisputes(next: any[]) {
  disputesByEscrowId = new Map(next.map((d) => [d.escrowId, d]));
}

/** In-memory store for submitted dispute responses, keyed by disputeId. */
let disputeResponsesByDisputeId = new Map<string, any>();

/** Reset submitted dispute responses between tests. */
export function resetDisputeResponses() {
  disputeResponsesByDisputeId = new Map();
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

    const input = (await request.json()) as any;
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

  /**
   * POST /disputes/:id/respond — merchant submits a counter-evidence response.
   *
   * Accepts multipart/form-data with the following fields:
   *   - merchantStatement (required string)
   *   - carrierTrackingUrl (optional string)
   *   - receiptFiles (0–5 File objects)
   *
   * Stores the parsed response in `disputeResponsesByDisputeId` so tests can
   * inspect what was submitted without setting up a real backend.
   */
  http.post(`${BASE_URL}/disputes/:id/respond`, async ({ params, request }) => {
    const disputeId = params.id as string;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return HttpResponse.json(
        errorResponse("Expected multipart/form-data body", "invalid_content_type"),
        { status: 400 }
      );
    }

    const merchantStatement = formData.get("merchantStatement");
    if (!merchantStatement || String(merchantStatement).trim().length === 0) {
      return HttpResponse.json(
        errorResponse("merchantStatement is required", "invalid_input"),
        { status: 400 }
      );
    }

    const carrierTrackingUrl = formData.get("carrierTrackingUrl");
    const receiptFiles = formData.getAll("receiptFiles") as File[];

    const now = new Date().toISOString();
    const response = {
      disputeId,
      merchantStatement: String(merchantStatement).trim(),
      carrierTrackingUrl: carrierTrackingUrl ? String(carrierTrackingUrl).trim() : null,
      receiptFileCount: receiptFiles.length,
      submittedAt: now,
    };

    disputeResponsesByDisputeId.set(disputeId, response);
    return HttpResponse.json(okResponse(response));
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
