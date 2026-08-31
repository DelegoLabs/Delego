"use client";

import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { ProofImageAttachment } from "../../lib/proofAttachments";

export interface ProofLightboxProps {
  image: ProofImageAttachment;
  onClose: () => void;
}

/**
 * Full-size view of a proof image (#579). Interim implementation until the
 * shared Modal primitive lands — it follows the same conventions the shared
 * Modal/Tabs/Badge/Tooltip set will use: labelled `role="dialog"`,
 * `aria-modal`, focus trapped inside, closes on Esc and on backdrop click.
 */
export function ProofLightbox({ image, onClose }: ProofLightboxProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useFocusTrap(panelRef, true);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="proof-lightbox-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="proof-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={image.alt ? `Proof image: ${image.alt}` : "Proof image"}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="proof-lightbox-header">
          <button
            type="button"
            aria-label="Close"
            className="proof-lightbox-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {failed ? (
          <p className="proof-empty-note">
            This image couldn&rsquo;t be loaded.{" "}
            <a href={image.url} target="_blank" rel="noopener noreferrer">
              Open the original
            </a>
            .
          </p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={image.alt ?? ""}
            className="proof-lightbox-image"
            onError={() => setFailed(true)}
          />
        )}
        {image.caption && (
          <p className="proof-lightbox-caption">{image.caption}</p>
        )}
      </div>
    </div>
  );
}
