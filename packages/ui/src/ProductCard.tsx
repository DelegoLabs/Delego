import type { HTMLAttributes } from "react";
import { formatAmount } from "./formatAmount.js";

/** Currency types supported by Delego products */
export type Currency = "USDC" | "XLM" | "EURC";

/** Product data structure for agent recommendations */
export interface RecommendedProduct {
  id: string;
  title: string;
  description: string;
  priceStroops: string;
  currency: Currency;
  merchantAddress: string;
  merchantRating: number; // 0 to 5.0
  imageUrl: string;
  inStock: boolean;
}

/** Props accepted by the ProductCard component */
export interface ProductCardProps extends HTMLAttributes<HTMLDivElement> {
  product: RecommendedProduct;
  onSelect: (productId: string) => void;
  onReject: (productId: string) => void;
  /** Optional ARIA label for accessibility */
  ariaLabel?: string;
}

/**
 * Renders a rich interactive product card for agent recommendations.
 * Displays product image, price, merchant rating, and action buttons.
 * Handles missing images with a fallback placeholder.
 */
export function ProductCard({
  product,
  onSelect,
  onReject,
  style,
  ariaLabel,
  ...props
}: ProductCardProps) {
  const cardId = props.id || `product-card-${product.id}`;
  
  // Format price using the formatAmount utility
  const priceStroopsBigInt = BigInt(product.priceStroops);
  const { value: formattedPrice, symbol: currencySymbol } = formatAmount(
    priceStroopsBigInt,
    { currency: "XLM" }
  );

  // Render star rating (0-5 scale)
  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    return (
      <span style={{ color: "#fbbf24", fontSize: "0.875rem" }}>
        {"★".repeat(fullStars)}
        {hasHalfStar && "⯨"}
        {"☆".repeat(emptyStars)}
        <span style={{ marginLeft: "0.25rem", color: "#6b7280" }}>
          ({rating.toFixed(1)})
        </span>
      </span>
    );
  };

  // Handle image load error
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'%3E%3Crect fill='%23e5e7eb' width='300' height='200'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%239ca3af'%3ENo Image%3C/text%3E%3C/svg%3E";
  };

  return (
    <div
      id={cardId}
      role="article"
      aria-label={ariaLabel || `Product: ${product.title}`}
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "0.5rem",
        overflow: "hidden",
        background: "#fff",
        maxWidth: "400px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        transition: "box-shadow 0.2s ease-in-out",
        ...style,
      }}
      {...props}
    >
      {/* Product Image */}
      <div style={{ position: "relative", width: "100%", height: "200px", overflow: "hidden" }}>
        <img
          src={product.imageUrl}
          alt={product.title}
          onError={handleImageError}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        {!product.inStock && (
          <div
            style={{
              position: "absolute",
              top: "0.5rem",
              right: "0.5rem",
              background: "#dc2626",
              color: "#fff",
              padding: "0.25rem 0.5rem",
              borderRadius: "0.25rem",
              fontSize: "0.75rem",
              fontWeight: 500,
            }}
          >
            Out of Stock
          </div>
        )}
      </div>

      {/* Product Details */}
      <div style={{ padding: "1rem" }}>
        <h3
          id={`${cardId}-title`}
          style={{
            margin: "0 0 0.5rem",
            fontSize: "1.125rem",
            fontWeight: 600,
            color: "#111",
          }}
        >
          {product.title}
        </h3>

        <p
          style={{
            margin: "0 0 0.75rem",
            fontSize: "0.875rem",
            color: "#6b7280",
            lineHeight: 1.5,
          }}
        >
          {product.description}
        </p>

        {/* Price */}
        <div style={{ marginBottom: "0.75rem" }}>
          <span
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#111",
            }}
          >
            {formattedPrice}
          </span>
          {currencySymbol && (
            <span
              style={{
                marginLeft: "0.25rem",
                fontSize: "1rem",
                fontWeight: 500,
                color: "#6b7280",
              }}
            >
              {currencySymbol}
            </span>
          )}
          <span
            style={{
              marginLeft: "0.5rem",
              fontSize: "0.75rem",
              color: "#9ca3af",
            }}
          >
            ({product.currency})
          </span>
        </div>

        {/* Merchant Rating */}
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>
            Merchant Rating
          </div>
          {renderStars(product.merchantRating)}
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => onSelect(product.id)}
            disabled={!product.inStock}
            aria-label={`Buy ${product.title} with agent`}
            style={{
              flex: 1,
              padding: "0.625rem 1rem",
              borderRadius: "0.375rem",
              border: "none",
              background: product.inStock ? "#2563eb" : "#9ca3af",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: product.inStock ? "pointer" : "not-allowed",
              transition: "all 0.2s ease-in-out",
              opacity: product.inStock ? 1 : 0.6,
            }}
            onMouseEnter={(e) => {
              if (product.inStock) {
                e.currentTarget.style.background = "#1d4ed8";
              }
            }}
            onMouseLeave={(e) => {
              if (product.inStock) {
                e.currentTarget.style.background = "#2563eb";
              }
            }}
          >
            Buy with Agent
          </button>

          <button
            type="button"
            onClick={() => onReject(product.id)}
            aria-label={`Skip ${product.title}`}
            style={{
              padding: "0.625rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #d1d5db",
              background: "transparent",
              color: "#6b7280",
              fontWeight: 500,
              fontSize: "0.875rem",
              cursor: "pointer",
              transition: "all 0.2s ease-in-out",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#f9fafb";
              e.currentTarget.style.borderColor = "#9ca3af";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "#d1d5db";
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
