import type { Escrow } from "@delegolabs/types";
import { isExtensionAllowed, type ExtensionPreset } from "./extensions";
import type { Eligibility } from "./batchRunner";

/**
 * Per-action eligibility checks for the escrow batch operations bar (#582).
 * Each returns a reason string suitable for the inline "why is this excluded"
 * label next to a selected-but-ineligible row.
 */

const RELEASABLE_STATUSES = new Set<Escrow["status"]>(["funded", "Funded"]);

export function isReleaseEligible(escrow: Escrow): Eligibility {
  if (escrow.cancellation) {
    return { eligible: false, reason: "Cancellation pending" };
  }
  if (!RELEASABLE_STATUSES.has(escrow.status)) {
    return { eligible: false, reason: "Not release-eligible" };
  }
  return { eligible: true };
}

export function isExtensionEligible(
  escrow: Escrow,
  preset: ExtensionPreset = "+1d"
): Eligibility {
  if (escrow.cancellation) {
    return { eligible: false, reason: "Cancellation pending" };
  }
  if (!RELEASABLE_STATUSES.has(escrow.status)) {
    return { eligible: false, reason: "Not extension-eligible" };
  }
  return isExtensionAllowed(escrow, preset);
}

/** Count of `escrows` eligible for release — the number shown in the sticky action bar. */
export function countReleaseEligible(escrows: Escrow[]): number {
  return escrows.filter((e) => isReleaseEligible(e).eligible).length;
}
