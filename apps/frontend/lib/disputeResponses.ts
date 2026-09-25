import { env } from "./env";
import { createRetryingFetch } from "./api";

export interface DisputeResponseForm {
  disputeId: string;
  responseStatement: string;
  proofOfDeliveryUrl?: string;
  /** Partial refund offer, in stroops. */
  counterOfferStroops?: string;
}

const retryingFetch = createRetryingFetch();

/**
 * Submits a merchant's counter-evidence/response for a dispute. There is no
 * `submitDisputeResponse` method on `@delegolabs/sdk` yet, so this calls the
 * REST endpoint directly (see `submitShipment` in `lib/shipments.ts` for the
 * same pattern and its auth caveat).
 */
export async function submitDisputeResponse(form: DisputeResponseForm): Promise<void> {
  const res = await retryingFetch(
    `${env.NEXT_PUBLIC_API_URL}/disputes/${form.disputeId}/respond`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        responseStatement: form.responseStatement.trim(),
        proofOfDeliveryUrl: form.proofOfDeliveryUrl?.trim() || undefined,
        counterOfferStroops: form.counterOfferStroops || undefined,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Failed to submit dispute response (${res.status}).`);
  }
}
