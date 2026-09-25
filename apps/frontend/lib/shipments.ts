import { env } from "./env";
import { createRetryingFetch } from "./api";

export type ShippingCarrier = "fedex" | "ups" | "usps" | "dhl" | "other";

export interface ShipmentSubmission {
  orderId: string;
  carrier: ShippingCarrier;
  trackingNumber: string;
  shippingNotes?: string;
}

export const SHIPPING_CARRIERS: { value: ShippingCarrier; label: string }[] = [
  { value: "fedex", label: "FedEx" },
  { value: "ups", label: "UPS" },
  { value: "usps", label: "USPS" },
  { value: "dhl", label: "DHL" },
  { value: "other", label: "Other" },
];

/**
 * Loose per-carrier tracking-number format check. Deliberately permissive
 * (a false negative blocking a valid tracking number is worse than a false
 * positive letting through a malformed one, since the real validation
 * happens carrier-side when the buyer looks it up) — this only catches
 * obviously-empty or nonsensical input.
 */
const CARRIER_PATTERNS: Record<ShippingCarrier, RegExp> = {
  fedex: /^[0-9]{12,22}$/,
  ups: /^1Z[0-9A-Z]{16}$/i,
  usps: /^[0-9]{20,22}$/,
  dhl: /^[0-9]{10,11}$/,
  other: /^.{3,64}$/,
};

export function isValidTrackingNumber(carrier: ShippingCarrier, trackingNumber: string): boolean {
  const trimmed = trackingNumber.trim();
  if (!trimmed) return false;
  return CARRIER_PATTERNS[carrier].test(trimmed);
}

const retryingFetch = createRetryingFetch();

/**
 * Submits a shipment record for an order, marking it shipped and (per the
 * backend) triggering a buyer notification. There is no `submitShipment`
 * method on the generated `@delegolabs/sdk` client yet, so this calls the
 * REST endpoint directly, going through the same retrying/demo-mode-aware
 * fetch wrapper the rest of the app uses (`createRetryingFetch`).
 * Session auth is expected to be cookie-based (`credentials: "include"`);
 * if the API instead expects a bearer token, wire that in here once the SDK
 * exposes how it stores one.
 */
export async function submitShipment(submission: ShipmentSubmission): Promise<void> {
  const res = await retryingFetch(`${env.NEXT_PUBLIC_API_URL}/orders/${submission.orderId}/ship`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      carrier: submission.carrier,
      trackingNumber: submission.trackingNumber.trim(),
      shippingNotes: submission.shippingNotes?.trim() || undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Failed to submit shipment (${res.status}).`);
  }
}
