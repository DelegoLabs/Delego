import type { NetworkId } from "./networks";

/**
 * Delivery-proof attachments on a fulfillment/timeline event (#579).
 *
 * The orchestrator validates delivery proofs before auto-releasing an escrow,
 * but buyers can't see the evidence that triggered the release. When a
 * timeline entry carries proofs we surface them behind a "View proof"
 * expander: images open in a lightbox, tracking URLs link out, and hashes get
 * copy-to-clipboard plus an explorer link when the value looks resolvable.
 *
 * Pure module — classification and URL resolution only; the expander/lightbox
 * live in components/timeline/.
 */

export interface ProofImageAttachment {
  kind: "image";
  url: string;
  /** Alt text / short description of what the image shows. */
  alt?: string;
  caption?: string;
}

export interface ProofLinkAttachment {
  kind: "link";
  url: string;
  /** e.g. "Carrier tracking", falls back to the URL. */
  label?: string;
}

export interface ProofHashAttachment {
  kind: "hash";
  value: string;
  /** e.g. "Delivery attestation", "IPFS CID". */
  label?: string;
}

export type ProofAttachment =
  | ProofImageAttachment
  | ProofLinkAttachment
  | ProofHashAttachment;

/** A 64-hex string — a Stellar transaction/operation hash we can deep-link. */
const TX_HASH_RE = /^[0-9a-f]{64}$/i;

/**
 * Explorer URL for a proof hash, or `null` when the value doesn't look like a
 * resolvable on-chain reference (e.g. an IPFS CID or an opaque attestation
 * digest) — in which case it's shown as a plain "cryptographic receipt".
 */
export function resolveProofHashExplorerUrl(
  value: string,
  networkId: NetworkId
): string | null {
  const trimmed = value.trim();
  if (!TX_HASH_RE.test(trimmed)) return null;
  const base =
    networkId === "mainnet"
      ? "https://stellar.expert/explorer/public"
      : "https://stellar.expert/explorer/testnet";
  return `${base}/tx/${trimmed.toLowerCase()}`;
}

/** Middle-truncates a long hash for display: `abcd1234…9876fedc`. */
export function truncateHash(value: string, edge = 8): string {
  const trimmed = value.trim();
  if (trimmed.length <= edge * 2 + 1) return trimmed;
  return `${trimmed.slice(0, edge)}…${trimmed.slice(-edge)}`;
}

/**
 * True when the only evidence is hash(es) — nothing viewable. Drives the
 * "cryptographic receipt" placeholder so the expander never looks empty.
 */
export function isHashesOnly(proofs: readonly ProofAttachment[]): boolean {
  return proofs.length > 0 && proofs.every((p) => p.kind === "hash");
}

/** Groups a mixed proof list by kind, preserving order within each group. */
export function groupProofs(proofs: readonly ProofAttachment[]): {
  images: ProofImageAttachment[];
  links: ProofLinkAttachment[];
  hashes: ProofHashAttachment[];
} {
  const images: ProofImageAttachment[] = [];
  const links: ProofLinkAttachment[] = [];
  const hashes: ProofHashAttachment[] = [];
  for (const proof of proofs) {
    if (proof.kind === "image") images.push(proof);
    else if (proof.kind === "link") links.push(proof);
    else hashes.push(proof);
  }
  return { images, links, hashes };
}

/** Human summary for the expander trigger: "2 photos, 1 link, 1 hash". */
export function summarizeProofs(proofs: readonly ProofAttachment[]): string {
  const { images, links, hashes } = groupProofs(proofs);
  const parts: string[] = [];
  if (images.length) parts.push(`${images.length} photo${images.length === 1 ? "" : "s"}`);
  if (links.length) parts.push(`${links.length} link${links.length === 1 ? "" : "s"}`);
  if (hashes.length) parts.push(`${hashes.length} hash${hashes.length === 1 ? "" : "es"}`);
  return parts.join(", ");
}
