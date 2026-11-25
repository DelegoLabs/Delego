"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, Badge } from "@delegolabs/ui";
import type { BadgeTone } from "@delegolabs/ui";
import type { DisputeEvidenceBundle } from "../../types/dispute-evidence";
import { apiFetch } from "../../lib/apiFetch";
import { EvidenceLightbox } from "./EvidenceLightbox";
import { ResolutionCountdown } from "./ResolutionCountdown";

export interface DisputeEvidenceComparisonProps {
  evidence: DisputeEvidenceBundle;
}

const STATUS_TONE: Record<DisputeEvidenceBundle["status"], BadgeTone> = {
  open: "warning",
  under_review: "info",
  settled: "success",
};

/**
 * Side-by-side view comparing buyer claim evidence and merchant shipping
 * counter-proofs. Supports fullscreen lightbox for high-res photo inspection
 * and displays resolution countdown clock.
 */
export function DisputeEvidenceComparison({ evidence }: DisputeEvidenceComparisonProps) {
  const t = useTranslations("disputeEvidence");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [lightboxTitle, setLightboxTitle] = useState<string>("");
  const [requestStatus, setRequestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [requestError, setRequestError] = useState<string | null>(null);

  const openLightbox = (imageUrl: string, title: string) => {
    setLightboxImage(imageUrl);
    setLightboxTitle(title);
  };

  const closeLightbox = () => {
    setLightboxImage(null);
    setLightboxTitle("");
  };

  async function requestMoreEvidence() {
    setRequestStatus("sending");
    setRequestError(null);

    try {
      const res = await apiFetch(`/disputes/${encodeURIComponent(evidence.disputeId)}/request-evidence`, {
        method: "POST",
      });
      if (res.error) throw new Error(res.error.message);
      setRequestStatus("sent");
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : t("merchantResponse.requestError"));
      setRequestStatus("error");
    }
  }

  return (
    <div className="dispute-evidence-comparison">
      <div className="dispute-evidence-header">
        <div className="dispute-evidence-status">
          <h2>{t("heading")}</h2>
          <Badge tone={STATUS_TONE[evidence.status]}>
            {t(`status.${evidence.status}`)}
          </Badge>
        </div>
        {evidence.resolutionDeadline && evidence.status !== "settled" && (
          <ResolutionCountdown deadline={evidence.resolutionDeadline} />
        )}
      </div>

      <div className="dispute-evidence-grid">
        {/* Buyer Evidence Column */}
        <Card
          title={t("buyerClaim.cardTitle")}
          ariaLabel={t("buyerClaim.cardAriaLabel", { disputeId: evidence.disputeId })}
        >
          <div className="dispute-evidence-section">
            <div className="dispute-evidence-statement">
              <h3 className="dispute-evidence-label">{t("buyerClaim.statementLabel")}</h3>
              <p className="dispute-statement-text">{evidence.buyerStatement}</p>
            </div>

            {evidence.buyerImages.length > 0 && (
              <div className="dispute-evidence-images">
                <h3 className="dispute-evidence-label">
                  {t("buyerClaim.photosLabel", { count: evidence.buyerImages.length })}
                </h3>
                <div className="dispute-image-grid">
                  {evidence.buyerImages.map((imageUrl, index) => (
                    <button
                      key={`buyer-${index}`}
                      type="button"
                      className="dispute-image-thumbnail"
                      onClick={() =>
                        openLightbox(
                          imageUrl,
                          t("buyerClaim.photoAriaLabel", { index: index + 1 })
                        )
                      }
                      aria-label={t("buyerClaim.photoAriaLabel", { index: index + 1 })}
                    >
                      <img
                        src={imageUrl}
                        alt={t("buyerClaim.photoAlt", { index: index + 1 })}
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
          title={t("merchantResponse.cardTitle")}
          ariaLabel={t("merchantResponse.cardAriaLabel", { disputeId: evidence.disputeId })}
        >
          <div className="dispute-evidence-section">
            {evidence.merchantStatement ? (
              <>
                <div className="dispute-evidence-statement">
                  <h3 className="dispute-evidence-label">{t("merchantResponse.counterStatementLabel")}</h3>
                  <p className="dispute-statement-text">{evidence.merchantStatement}</p>
                </div>

                {evidence.merchantImages && evidence.merchantImages.length > 0 && (
                  <div className="dispute-evidence-images">
                    <h3 className="dispute-evidence-label">
                      {t("merchantResponse.shippingProofLabel", { count: evidence.merchantImages.length })}
                    </h3>
                    <div className="dispute-image-grid">
                      {evidence.merchantImages.map((imageUrl, index) => (
                        <button
                          key={`merchant-${index}`}
                          type="button"
                          className="dispute-image-thumbnail"
                          onClick={() =>
                            openLightbox(
                              imageUrl,
                              t("merchantResponse.proofAriaLabel", { index: index + 1 })
                            )
                          }
                          aria-label={t("merchantResponse.proofAriaLabel", { index: index + 1 })}
                        >
                          <img
                            src={imageUrl}
                            alt={t("merchantResponse.proofAlt", { index: index + 1 })}
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
                <p>{t("merchantResponse.noResponse")}</p>
                {evidence.status === "open" &&
                  (requestStatus === "sent" ? (
                    <p className="dispute-request-success" role="status">
                      {t("merchantResponse.requestSuccess")}
                    </p>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="dispute-request-button"
                        disabled={requestStatus === "sending"}
                        onClick={requestMoreEvidence}
                      >
                        {requestStatus === "sending"
                          ? t("merchantResponse.requesting")
                          : t("merchantResponse.requestButton")}
                      </button>
                      {requestError && (
                        <p className="dispute-request-error" role="alert">
                          {requestError}
                        </p>
                      )}
                    </>
                  ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Arbitrator Verdict Section */}
      {evidence.arbitratorVerdict && (
        <Card
          title={t("arbitratorVerdict.cardTitle")}
          ariaLabel={t("arbitratorVerdict.cardAriaLabel", { disputeId: evidence.disputeId })}
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

        .dispute-request-button:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .dispute-request-success {
          margin: 0;
          color: #15803d;
        }

        .dispute-request-error {
          margin: 0;
          color: #dc2626;
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
