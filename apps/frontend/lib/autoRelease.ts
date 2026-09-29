/**
 * Pure helpers for the automated carrier-delivery release badge (#708).
 *
 * An escrow can be released two ways: the buyer does it manually, or the
 * orchestrator does it automatically once a carrier-tracking oracle confirms
 * delivery. This module owns the data shape and the predicates that let the UI
 * tell the two apart — the badge must never appear on a manual release.
 */

/** Carrier-tracking oracle that attested the delivery. */
export type OracleProvider = "easypost" | "fedex" | "ups";

/**
 * Release metadata attached to an escrow that was paid out automatically
 * from verified carrier tracking. Matches the shape documented in #708.
 */
export interface AutoReleaseMeta {
  isAutoReleased: boolean;
  oracleProvider: OracleProvider;
  deliveredTimestamp: string;
  signatureProofHash: string;
}

export const ORACLE_PROVIDER_LABELS: Record<OracleProvider, string> = {
  easypost: "EasyPost",
  fedex: "FedEx",
  ups: "UPS",
};

/** Signature hashes are lowercase hex SHA-256 digests. */
const PROOF_HASH_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * Reads the display label for a provider, falling back to the raw value so a
 * provider the UI doesn't know about yet still renders something sensible.
 */
export function oracleProviderLabel(provider: string): string {
  return ORACLE_PROVIDER_LABELS[provider as OracleProvider] ?? provider;
}

/** True when `hash` looks like a SHA-256 proof digest. */
export function isValidProofHash(hash: string | null | undefined): boolean {
  return typeof hash === "string" && PROOF_HASH_PATTERN.test(hash);
}

/**
 * Whether the escrow was genuinely auto-released. Requires the flag *and* a
 * usable proof hash — without the signature there is nothing to show in the
 * proof modal, so an incomplete payload is treated as a manual release rather
 * than rendering a badge that leads to an empty dialog.
 */
export function isVerifiedAutoRelease(
  meta: Partial<AutoReleaseMeta> | null | undefined
): boolean {
  if (!meta?.isAutoReleased) return false;
  return isValidProofHash(meta.signatureProofHash);
}

/**
 * Shortens a proof hash for inline display: `a1b2c3d4e5…9876fedc`.
 * Non-hash input is returned unchanged (it's already short, or not ours).
 */
export function shortenProofHash(hash: string, lead = 10, tail = 8): string {
  if (!hash || hash.length <= lead + tail + 1) return hash;
  return `${hash.slice(0, lead)}…${hash.slice(-tail)}`;
}

/**
 * Formats the oracle's delivery timestamp in the viewer's locale. Invalid
 * dates return an empty string so the caller can omit the row entirely.
 */
export function formatDeliveredTimestamp(
  timestamp: string,
  locale?: string
): string {
  const delivered = new Date(timestamp);
  if (Number.isNaN(delivered.getTime())) return "";
  return delivered.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One-line summary for the badge, e.g. "Auto-released via FedEx tracking" —
 * deliberately worded to contrast with a manual "You released" action.
 */
export function autoReleaseSummary(meta: AutoReleaseMeta): string {
  return `Auto-released via ${oracleProviderLabel(meta.oracleProvider)} tracking`;
}
