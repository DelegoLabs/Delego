"use client";

import { useState, type SyntheticEvent } from "react";
import { Amount, Badge, Button, Card } from "@delegolabs/ui";

/**
 * Props for the in-chat product recommendation card (#790).
 *
 * The first five fields are the technical specification; `stockQuantity` is an
 * optional extension that drives the stock badge (it is omitted when the
 * catalog does not track stock for the product).
 */
export interface InChatProductCardProps {
  productId: string;
  title: string;
  priceStroops: bigint;
  imageUrl: string;
  /** Units left in stock. Omit when stock is untracked for this product. */
  stockQuantity?: number;
  /**
   * 1-click checkout trigger. Callers may return a promise: the card shows a
   * loading state until it settles, then either marks the order as placed or
   * surfaces a retryable error.
   */
  onBuyNow(productId: string): void | Promise<void>;
}

/** Buy button lifecycle for a single card. */
type PurchaseStatus = "idle" | "buying" | "ordered" | "error";

/** Units-at-or-below this count get the low-stock ("Only N left") badge. */
const LOW_STOCK_THRESHOLD = 5;

const FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'%3E%3Crect fill='%23e5e7eb' width='300' height='200'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%239ca3af'%3ENo Image%3C/text%3E%3C/svg%3E";

/**
 * Interactive product recommendation rendered inline in the Buyer Agent chat
 * stream (#790).
 *
 * - Shows the product image (with a graceful fallback), title, price, and a
 *   stock badge derived from `stockQuantity`.
 * - "Buy now" triggers `onBuyNow` with the product id — a single click, no
 *   confirmation step — and shows a loading state while the checkout promise
 *   is pending.
 * - Out-of-stock products disable the button; a failed checkout keeps the
 *   card retryable and announces the error to assistive technology.
 */
export function InChatProductCard({
  productId,
  title,
  priceStroops,
  imageUrl,
  stockQuantity,
  onBuyNow,
}: InChatProductCardProps) {
  const [status, setStatus] = useState<PurchaseStatus>("idle");

  const isOutOfStock = stockQuantity !== undefined && stockQuantity <= 0;
  const isBuying = status === "buying";
  const isOrdered = status === "ordered";
  const isDisabled = isOutOfStock || isBuying || isOrdered;

  function handleImageError(event: SyntheticEvent<HTMLImageElement>) {
    event.currentTarget.src = FALLBACK_IMAGE;
  }

  async function handleBuyNow() {
    if (isDisabled) return;
    setStatus("buying");
    try {
      await onBuyNow(productId);
      setStatus("ordered");
    } catch {
      setStatus("error");
    }
  }

  return (
    <Card
      ariaLabel={`Product recommendation: ${title}`}
      data-testid="in-chat-product-card"
      data-product-id={productId}
      style={{ maxWidth: "26rem" }}
    >
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
        {/* ── Thumbnail ─────────────────────────────────────────────── */}
        <img
          src={imageUrl}
          alt={title}
          loading="lazy"
          onError={handleImageError}
          data-testid="in-chat-product-image"
          style={{
            width: "5rem",
            height: "5rem",
            objectFit: "cover",
            borderRadius: "0.5rem",
            border: "1px solid #e5e7eb",
            flexShrink: 0,
            background: "#f9fafb",
          }}
        />

        {/* ── Details ───────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.375rem",
            minWidth: 0,
            flex: 1,
          }}
        >
          <span
            style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#111827" }}
            data-testid="in-chat-product-title"
          >
            {title}
          </span>

          <div
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}
          >
            <strong
              style={{ fontSize: "1rem", color: "#111827" }}
              data-testid="in-chat-product-price"
            >
              <Amount stroops={priceStroops} />
            </strong>

            {stockQuantity !== undefined && (
              <Badge
                tone={
                  isOutOfStock
                    ? "error"
                    : stockQuantity <= LOW_STOCK_THRESHOLD
                      ? "warning"
                      : "success"
                }
                data-testid="in-chat-product-stock-badge"
              >
                {isOutOfStock
                  ? "Out of stock"
                  : stockQuantity <= LOW_STOCK_THRESHOLD
                    ? `Only ${stockQuantity} left`
                    : "In stock"}
              </Badge>
            )}

            {isOrdered && (
              <Badge tone="success" data-testid="in-chat-product-ordered-badge">
                Order placed
              </Badge>
            )}
          </div>

          {status === "error" && (
            <p
              role="alert"
              data-testid="in-chat-product-purchase-error"
              style={{ margin: 0, fontSize: "0.75rem", color: "#dc2626" }}
            >
              Purchase failed — please try again.
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.25rem" }}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleBuyNow}
              disabled={isDisabled}
              aria-busy={isBuying}
              aria-label={
                isOrdered
                  ? `Order placed for ${title}`
                  : `Buy ${title} now`
              }
              data-testid="in-chat-product-buy-button"
            >
              {isBuying ? "Buying…" : isOrdered ? "Purchased" : "Buy now"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Loading announcement (visible + announced) ──────────────── */}
      <span role="status" data-testid="in-chat-product-status" style={{ display: "block" }}>
        {isBuying ? "Placing your order…" : ""}
      </span>
    </Card>
  );
}
