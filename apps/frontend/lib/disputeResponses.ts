import { env } from "./env";
import { isDemoMode } from "./demoMode";
import { DemoModeWriteBlockedError } from "./api";

export interface DisputeResponseForm {
  disputeId: string;
  merchantStatement: string;
  carrierTrackingUrl?: string;
  receiptFiles: File[];
}

/**
 * Submits a merchant's counter-evidence and written response for a dispute.
 *
 * Uses `multipart/form-data` so that receipt file attachments are streamed
 * directly to the API — no base64 bloat or separate upload step needed.
 *
 * The `FormData` body layout mirrors what the backend expects on
 * `POST /disputes/:id/respond` (see Delego-backend dispute-service).
 *
 * Demo-mode writes are blocked at this layer to match the behaviour of
 * `createRetryingFetch` / `apiFetch` for all other mutating calls.
 */
export async function submitDisputeResponse(form: DisputeResponseForm): Promise<void> {
  if (isDemoMode()) {
    throw new DemoModeWriteBlockedError(
      "POST",
      `/disputes/${form.disputeId}/respond`
    );
  }

  const body = new FormData();
  body.append("merchantStatement", form.merchantStatement.trim());

  if (form.carrierTrackingUrl?.trim()) {
    body.append("carrierTrackingUrl", form.carrierTrackingUrl.trim());
  }

  for (const file of form.receiptFiles) {
    body.append("receiptFiles", file);
  }

  const res = await fetch(
    `${env.NEXT_PUBLIC_API_URL}/disputes/${form.disputeId}/respond`,
    {
      method: "POST",
      credentials: "include",
      // Do NOT set Content-Type — the browser must set it with the boundary
      // parameter when sending multipart/form-data.
      body,
    }
  );

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(
      json?.error?.message ??
        json?.message ??
        `Failed to submit dispute response (${res.status}).`
    );
  }
}
