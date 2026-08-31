"use client";

import { useId, useState } from "react";
import { CopyButton } from "../wallet/CopyButton";
import { ProofLightbox } from "./ProofLightbox";
import type { NetworkId } from "../../lib/networks";
import {
  groupProofs,
  isHashesOnly,
  resolveProofHashExplorerUrl,
  summarizeProofs,
  truncateHash,
  type ProofAttachment,
  type ProofImageAttachment,
} from "../../lib/proofAttachments";

export interface ProofExpanderProps {
  proofs: ProofAttachment[];
  /** Active network, for resolving hash → explorer links. */
  networkId?: NetworkId;
}

function ProofThumbnail({
  image,
  onOpen,
}: {
  image: ProofImageAttachment;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a
        className="proof-thumb proof-thumb-failed"
        href={image.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        Image unavailable — open original
      </a>
    );
  }
  return (
    <button
      type="button"
      className="proof-thumb"
      onClick={onOpen}
      aria-label={
        image.alt ? `View proof image: ${image.alt}` : "View proof image"
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url} alt={image.alt ?? ""} onError={() => setFailed(true)} />
    </button>
  );
}

/**
 * "View proof" expander for a timeline entry carrying delivery evidence
 * (#579). Images open in a focus-trapped lightbox; tracking URLs link out;
 * hashes get copy-to-clipboard plus an explorer link when the value resolves,
 * otherwise a "cryptographic receipt" tag. A hashes-only entry shows an
 * explanatory placeholder so the panel never reads as empty.
 */
export function ProofExpander({ proofs, networkId = "testnet" }: ProofExpanderProps) {
  const [lightbox, setLightbox] = useState<ProofImageAttachment | null>(null);
  const panelId = useId();

  if (proofs.length === 0) return null;

  const { images, links, hashes } = groupProofs(proofs);
  const hashesOnly = isHashesOnly(proofs);

  return (
    <details className="proof-expander">
      <summary aria-controls={panelId}>
        View proof <span className="proof-summary-count">({summarizeProofs(proofs)})</span>
      </summary>

      <div id={panelId} className="proof-panel">
        {hashesOnly && (
          <p className="proof-empty-note">
            Cryptographic receipt — there&rsquo;s no photo or link to view, just
            the hash(es) below. Verify one against the ledger or the issuing
            system to confirm the delivery proof.
          </p>
        )}

        {images.length > 0 && (
          <div className="proof-thumbs">
            {images.map((image, i) => (
              <ProofThumbnail
                key={`${image.url}-${i}`}
                image={image}
                onOpen={() => setLightbox(image)}
              />
            ))}
          </div>
        )}

        {links.length > 0 && (
          <ul className="proof-links">
            {links.map((link, i) => (
              <li key={`${link.url}-${i}`}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label ?? link.url}
                </a>
              </li>
            ))}
          </ul>
        )}

        {hashes.length > 0 && (
          <ul className="proof-hashes">
            {hashes.map((hash, i) => {
              const explorerUrl = resolveProofHashExplorerUrl(
                hash.value,
                networkId
              );
              return (
                <li key={`${hash.value}-${i}`} className="proof-hash-row">
                  {hash.label && (
                    <span className="proof-hash-label">{hash.label}</span>
                  )}
                  <code className="proof-hash-value" title={hash.value}>
                    {truncateHash(hash.value)}
                  </code>
                  <CopyButton value={hash.value} label="Copy hash" />
                  {explorerUrl ? (
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="proof-hash-explorer"
                    >
                      View on explorer
                    </a>
                  ) : (
                    <span className="proof-hash-receipt">
                      cryptographic receipt
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {lightbox && (
        <ProofLightbox image={lightbox} onClose={() => setLightbox(null)} />
      )}
    </details>
  );
}
