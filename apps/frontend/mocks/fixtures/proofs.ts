import type {
  ProofAttachment,
  ProofHashAttachment,
  ProofImageAttachment,
  ProofLinkAttachment,
} from "../../lib/proofAttachments";

/**
 * Delivery-proof fixture matrix (#579). Covers every attachment type plus the
 * degrade paths: a broken image URL, a hash that resolves to an explorer link,
 * and an opaque hash that doesn't.
 */

export const proofImage: ProofImageAttachment = {
  kind: "image",
  url: "https://images.example.com/proof-of-delivery.jpg",
  alt: "Parcel on the doorstep",
  caption: "Captured by the carrier at drop-off",
};

export const proofImageBroken: ProofImageAttachment = {
  kind: "image",
  url: "https://images.example.com/does-not-exist.jpg",
  alt: "Unavailable proof photo",
};

export const proofTrackingLink: ProofLinkAttachment = {
  kind: "link",
  url: "https://carrier.example.com/track/1Z999AA10123456784",
  label: "Carrier tracking",
};

/** A 64-hex value — resolves to a stellar.expert tx link. */
export const proofTxHash: ProofHashAttachment = {
  kind: "hash",
  value: "a1b2c3d4e5f60718a1b2c3d4e5f60718a1b2c3d4e5f60718a1b2c3d4e5f60718",
  label: "Auto-release transaction",
};

/** An opaque digest (IPFS CID) — shown as a plain "cryptographic receipt". */
export const proofOpaqueHash: ProofHashAttachment = {
  kind: "hash",
  value: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  label: "Signed delivery attestation",
};

export const proofMatrix: ProofAttachment[] = [
  proofImage,
  proofImageBroken,
  proofTrackingLink,
  proofTxHash,
  proofOpaqueHash,
];

export const proofHashesOnly: ProofAttachment[] = [proofTxHash, proofOpaqueHash];

export const proofImagesOnly: ProofAttachment[] = [proofImage];
