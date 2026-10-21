"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@delegolabs/ui";
import type { PurchaseProposal } from "../../types/proposal";

/** Comparison matrix for multiple merchant proposals side-by-side. */
export interface ProposalComparisonMatrix {
  productTitle: string;
  offers: Array<{
    merchantId: string;
    merchantName: string;
    priceStroops: string;
    shippingStroops: string;
    estimatedDeliveryDays: number;
    ratingScore: number;
    escrowAddress: string;
  }>;
  recommendedIndex: number;
}

export interface ProposalComparisonCardProps {
  matrix: ProposalComparisonMatrix;
  onAccept: (merchantId: string, proposalId: string) => Promise<void>;
}

/** Format stroops to human-readable amount */
function formatStroops(stroops: string): string {
  const num = Number(stroops);
  if (num >= 1_000_000_000) {
    return `$${(num / 1_000_000_000).toFixed(2)}`;
  }
  if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(2)}M`;
  }
  return `$${num}`;
}

/** Get badge tone based on rating */
function getRatingTone(rating: number): "success" | "warning" | "neutral" {
  if (rating >= 4.5) return "success";
  if (rating >= 3) return "warning";
  return "neutral";
}

export function ProposalComparisonCard({
  matrix,
  onAccept,
}: ProposalComparisonCardProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const bestOffer = matrix.offers[matrix.recommendedIndex];
  const isRecommended = (idx: number) => idx === matrix.recommendedIndex;

  return (
    <Card
      ariaLabel={`Purchase proposal comparison for ${matrix.productTitle}`}
      data-testid="proposal-comparison-card"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          padding: "1rem",
        }}
      >
        {matrix.offers.map((offer, idx) => {
          const isRecommended = idx === matrix.recommendedIndex;
          const ratingTone = getRatingTone(offer.ratingScore);
          const isSelected = selectedIndex === idx;

          return (
            <div
              key={offer.merchantId}
              style={{
                border: isSelected ? "2px solid #2563eb" : "1px solid #e5e7eb",
                borderRadius: "0.5rem",
                background: "#fff",
                overflow: "hidden",
                transition: "border-color 0.2s",
              }}
            >
              {/* Merchant header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 0.5rem",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <span
                  style={{
                    fontWeight: 500,
                    fontSize: "0.875rem",
                    color: "#111827",
                  }}
                >
                  {offer.merchantName}
                </span>
                <Badge
                  tone={ratingTone}
                  data-testid="proposal-rating-badge"
                  style={{
                    fontSize: "0.625rem",
                  }}
                >
                  {offer.ratingScore.toFixed(1)}
                </Badge>
              </div>

              {/* Price */}
              <div
                style={{
                  padding: "0.5rem",
                  fontSize: "0.875rem",
                  color: "#374151",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <span
                  style={{ fontWeight: 500, color: "#111827" }}
                >
                  {formatStroops(offer.priceStroops)}
                </span>
                <span
                  style={{
                    fontSize: "0.625rem",
                    color: "#6b7280",
                  }}
                >
                  + shipping ${formatStroops(offer.shippingStroops)}
                </span>
              </div>

              {/* Delivery estimate */}
              <div
                style={{
                  padding: "0.5rem",
                  fontSize: "0.875rem",
                  color: "#374151",
                }}
              >
                <span
                  style={{ fontWeight: 500, color: "#111827" }}
                >
                  Est. delivery:
                </span>
                {offer.estimatedDeliveryDays === 1 ? (
                  "1 day"
                ) : (
                  `${offer.estimatedDeliveryDays} days`
                )}
              </div>

              {/* Accept button */}
              <div
                style={{
                  padding: "0.5rem",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.5rem",
                }}
              >
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setSelectedIndex(idx);
                    onAccept(offer.merchantId, offer.proposalId);
                  }}
                  disabled={isSelected}
                  style={{
                    width: "100%",
                  }}
                >
                  {isSelected ? "Selected" : "Accept This Offer"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}