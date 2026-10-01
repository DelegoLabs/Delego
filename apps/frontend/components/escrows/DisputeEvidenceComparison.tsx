"use client";

import { useState } from "react";
import { Card, Badge } from "@delegolabs/ui";
import type { BadgeTone } from "@delegolabs/ui";
import type { DisputeEvidenceBundle } from "../../types/dispute-evidence";
import { EvidenceLightbox } from "./EvidenceLightbox";
import { ResolutionCountdown } from "./ResolutionCountdown";

export interface DisputeEvidenceComparisonProps {
  evidence: DisputeEvidenceBundle;
  resolutionDeadline?: string; // ISO timestamp
  onRequestMoreEvidence?: () => void;
}

const STATUS_TONE: Record<DisputeEvidenceBundle["status"], BadgeTone> = {
  open: "warning",
  under_review: "info",
  settled: "success",
};

const STATUS_LABELS: Record<DisputeEvidenceBundle["status"], string> = {
  open: "Open",
  under_review: "Under Review",
  settled: "Settled",
};

/**
 * Side-by-side view comparing buyer claim evidence and merchant shipping
 * counter-proofs. Supports fullscreen lightbox for high-res photo inspection
 * and displays resolution countdown clock.
 */
export function DisputeEvidenceComparison({
  evidence,
  resolutionDeadline,
  onRequestMoreEvidence,
}: DisputeEvidenceComparisonProps) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [lightboxTitle, setLightboxTitle] = useState<string>("");

  const openLightbox = (imageUrl: string, title: string) => {
    setLightboxImage(imageUrl);
    setLightboxTitle(title);
  };

  const closeLightbox = () => {
    setLightboxImage(null);
    setLightboxTitle("");
  };

  return (
    <div className="dispute-evidence-comparison">
      <div className="dispute-evidence-header">
        <div className="dispute-evidence-status">
          <h2>Dispute Evidence</h2>
          <Badge tone={STATUS_TONE[evidence.status]}>
            {STATUS_LABELS[evidence.status]}
          </Badge>
        </div>
        {resolutionDeadline && evidence.status !== "settled" && (
          <ResolutionCountdown deadline={resolutionDeadline} />
        )}
      </div>

      <div className="dispute-evidence-grid">
        {/* Buyer Evidence Column */}
        <Card
          title="Buyer Claim"
          ariaLabel={`Buyer evidence for dispute ${evidence.disputeId}`}
        >
          <div className="dispute-evidence-section">
            <div className="dispute-evidence-statement">
              <h3 className="dispute-evidence-label">Statement</h3>
              <p className="dispute-statement-text">{evidence.buyerStatement}</p>
            </div>

            {evidence.buyerImages.length > 0 && (
              <div className="dispute-evidence-images">
                <h3 className="dispute-evidence-label">
                  Evidence Photos ({evidence.buyerImages.length})
                </h3>
                <div className="dispute-image-grid">
                  {evidence.buyerImages.map((imageUrl, index) => (
                    <button
                      key={`buyer-${index}`}
                      type="button"
                      className="dispute-image-thumbnail"
                      onClick={() => openLightbox(imageUrl, `Buyer Evidence ${index + 1}`)}
                      aria-label={`View buyer evidence photo ${index + 1}`}
                    >
                      <img
                        src={imageUrl}
                        alt={`Buyer evidence ${index + 1}`}
                        loading="lazy"
                      />
                      <div className="dispute-image-overlay">
                        <span className="dispute-zoom-icon">🔍</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Merchant Counter-Evidence Column */}
        <Card
          title="Merchant Response"
          ariaLabel={`Merchant counter-evidence for dispute ${evidence.disputeId}`}
        >
          <div className="dispute-evidence-section">
            {evidence.merchantStatement ? (
              <>
                <div className="dispute-evidence-statement">
                  <h3 className="dispute-evidence-label">Counter Statement</h3>
                  <p className="dispute-statement-text">{evidence.merchantStatement}</p>
                </div>

                {evidence.merchantImages && evidence.merchantImages.length > 0 && (
                  <div className="dispute-evidence-images">
                    <h3 className="dispute-evidence-label">
                      Shipping Proof ({evidence.merchantImages.length})
                    </h3>
                    <div className="dispute-image-grid">
                      {evidence.merchantImages.map((imageUrl, index) => (
                        <button
                          key={`merchant-${index}`}
                          type="button"
                          className="dispute-image-thumbnail"
                          onClick={() => openLightbox(imageUrl, `Merchant Proof ${index + 1}`)}
                          aria-label={`View merchant proof photo ${index + 1}`}
                        >
                          <img
                            src={imageUrl}
                            alt={`Merchant proof ${index + 1}`}
                            loading="lazy"
                          />
                          <div className="dispute-image-overlay">
                            <span className="dispute-zoom-icon">🔍</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="dispute-no-response">
                <p>Merchant has not yet provided a response.</p>
                {onRequestMoreEvidence && evidence.status === "open" && (
                  <button
                    type="button"
                    className="dispute-request-button"
                    onClick={onRequestMoreEvidence}
                  >
                    Request Merchant Response
                  </button>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Arbitrator Verdict Section */}
      {evidence.arbitratorVerdict && (
        <Card
          title="Arbitrator Verdict"
          ariaLabel={`Arbitrator verdict for dispute ${evidence.disputeId}`}
        >
          <div className="dispute-verdict">
            <p className="dispute-statement-text">{evidence.arbitratorVerdict}</p>
          </div>
        </Card>
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <EvidenceLightbox
          imageUrl={lightboxImage}
          title={lightboxTitle}
          onClose={closeLightbox}
        />
      )}

      <style jsx>{`
        .dispute-evidence-comparison {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .dispute-evidence-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .dispute-evidence-status {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .dispute-evidence-status h2 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
        }

        .dispute-evidence-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }

        @media (max-width: 768px) {
          .dispute-evidence-grid {
            grid-template-columns: 1fr;
          }
        }

        .dispute-evidence-section {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .dispute-evidence-label {
          font-size: 0.875rem;
          font-weight: 600;
          margin: 0 0 0.5rem 0;
          color: #374151;
        }

        .dispute-statement-text {
          margin: 0;
          line-height: 1.6;
          color: #1f2937;
        }

        .dispute-evidence-images {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .dispute-image-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 0.75rem;
        }

        .dispute-image-thumbnail {
          position: relative;
          aspect-ratio: 1;
          border: none;
          border-radius: 0.5rem;
          overflow: hidden;
          cursor: pointer;
          background: #f3f4f6;
          padding: 0;
          transition: transform 0.2s;
        }

        .dispute-image-thumbnail:hover {
          transform: scale(1.05);
        }

        .dispute-image-thumbnail:focus {
          outline: 2px solid #2563eb;
          outline-offset: 2px;
        }

        .dispute-image-thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .dispute-image-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .dispute-image-thumbnail:hover .dispute-image-overlay,
        .dispute-image-thumbnail:focus .dispute-image-overlay {
          opacity: 1;
        }

        .dispute-zoom-icon {
          font-size: 1.5rem;
        }

        .dispute-no-response {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          text-align: center;
          color: #6b7280;
        }

        .dispute-no-response p {
          margin: 0 0 1rem 0;
        }

        .dispute-request-button {
          padding: 0.625rem 1rem;
          border-radius: 0.5rem;
          border: 1px solid #d1d5db;
          background: #fff;
          color: #374151;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .dispute-request-button:hover {
          background: #f3f4f6;
          border-color: #9ca3af;
        }

        .dispute-request-button:focus {
          outline: 2px solid #2563eb;
          outline-offset: 2px;
        }

        .dispute-verdict {
          padding: 1rem;
          background: #f0fdf4;
          border-left: 4px solid #10b981;
          border-radius: 0.5rem;
        }
      `}</style>
    </div>
  );
}
