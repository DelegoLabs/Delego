"use client";

import { useRef } from "react";
import type { Order } from "@delegolabs/types";
import type { MerchantEscrowOrder } from "../../lib/merchantEscrowOrders";
import { useFocusTrap } from "../../hooks/useFocusTrap";

export interface MerchantPackingSlipModalProps {
  isOpen: boolean;
  order: MerchantEscrowOrder | Order | null;
  onClose: () => void;
}

function formatDate(dateVal?: Date | string | null): string {
  if (!dateVal) return "—";
  const date = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
  return Number.isNaN(date.getTime())
    ? String(dateVal)
    : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatStroops(stroops?: string | number | bigint | null): string {
  if (!stroops) return "0.00 XLM";
  try {
    const val = Number(BigInt(stroops)) / 10_000_000;
    return `${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 })} XLM`;
  } catch {
    return String(stroops);
  }
}

interface PackingSlipItem {
  name: string;
  quantity: number;
  priceStroops?: string;
}

function getItems(order: MerchantEscrowOrder | Order): PackingSlipItem[] {
  if ("items" in order && Array.isArray(order.items) && order.items.length > 0) {
    return order.items.map((it: any) => ({
      name: it.name || it.title || it.productId || "Item",
      quantity: Number(it.quantity) || 1,
      priceStroops: it.priceStroops ? String(it.priceStroops) : it.unitPriceStroops ? String(it.unitPriceStroops) : undefined,
    }));
  }
  if ("lineItems" in order && Array.isArray(order.lineItems) && order.lineItems.length > 0) {
    return order.lineItems.map((it: any) => ({
      name: it.name || it.productId || "Item",
      quantity: Number(it.quantity) || 1,
      priceStroops: it.unitPriceStroops ? String(it.unitPriceStroops) : undefined,
    }));
  }
  return [
    {
      name: "Standard Package Item",
      quantity: 1,
      priceStroops: "amountStroops" in order ? (order as MerchantEscrowOrder).amountStroops : "totalStroops" in order ? String((order as Order).totalStroops) : undefined,
    },
  ];
}

/**
 * Merchant Packing Slip view modal (#1029).
 * Renders physical shipping packing slip for merchant order fulfillment.
 * Honors the buyer's request to hide item pricing when sending as a gift,
 * and attaches personalized gift messages and recipient details.
 */
export function MerchantPackingSlipModal({
  isOpen,
  order,
  onClose,
}: MerchantPackingSlipModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ containerRef: modalRef, isActive: isOpen, onEscape: onClose });

  if (!isOpen || !order) return null;

  const orderId = "orderId" in order ? order.orderId : order.id;
  const buyer = "buyerAddress" in order ? order.buyerAddress : (order as any).userId ?? "Unknown";
  const shippingAddress = "shippingAddress" in order ? order.shippingAddress : (order as any).shippingAddress ?? "Standard Delivery";
  const date = "fundedAt" in order ? order.fundedAt : order.createdAt;

  const giftOptions = (order as any).giftOptions ?? (order as any).metadata?.giftOptions;
  const isGift = Boolean(giftOptions?.isGift);
  const hidePricing = isGift && Boolean(giftOptions?.hidePackingSlipPrice);

  const items = getItems(order);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Packing slip for order ${orderId}`}
      data-testid="merchant-packing-slip-modal"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        data-testid="packing-slip-view"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "0.75rem",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "2rem",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        {/* Packing Slip Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111827", paddingBottom: "1rem" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Packing Slip
            </h2>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#4b5563" }}>
              Order ID: <strong data-testid="packing-slip-order-id">{orderId}</strong>
            </p>
            <p style={{ margin: "0.125rem 0 0", fontSize: "0.8125rem", color: "#6b7280" }}>
              Date: {formatDate(date)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close packing slip"
            style={{
              background: "transparent",
              border: "none",
              fontSize: "1.25rem",
              cursor: "pointer",
              color: "#6b7280",
            }}
          >
            ✕
          </button>
        </div>

        {/* Gift Banner & Message */}
        {isGift && (
          <div
            data-testid="packing-slip-gift-section"
            style={{
              padding: "1rem",
              borderRadius: "0.5rem",
              background: "#fef3c7",
              border: "1px solid #f59e0b",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
              <span role="img" aria-label="gift">🎁</span>
              <strong style={{ fontSize: "0.875rem", color: "#92400e" }}>This order is a gift</strong>
            </div>

            {giftOptions.recipientName && (
              <p style={{ margin: "0 0 0.375rem", fontSize: "0.875rem", color: "#78350f" }}>
                <strong>Recipient:</strong>{" "}
                <span data-testid="packing-slip-recipient-name">{giftOptions.recipientName}</span>
              </p>
            )}

            {giftOptions.giftMessage && (
              <div style={{ marginTop: "0.5rem" }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "#92400e" }}>
                  Gift Message:
                </span>
                <blockquote
                  data-testid="packing-slip-gift-message"
                  style={{
                    margin: "0.25rem 0 0",
                    padding: "0.5rem 0.75rem",
                    background: "#fff",
                    borderRadius: "0.375rem",
                    borderLeft: "3px solid #d97706",
                    fontStyle: "italic",
                    fontSize: "0.875rem",
                    color: "#1f2937",
                  }}
                >
                  {giftOptions.giftMessage}
                </blockquote>
              </div>
            )}
          </div>
        )}

        {/* Shipping details */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.875rem" }}>
          <div>
            <h4 style={{ margin: "0 0 0.25rem", color: "#6b7280", textTransform: "uppercase", fontSize: "0.75rem" }}>
              Deliver To:
            </h4>
            {giftOptions?.recipientName ? (
              <p style={{ margin: "0 0 0.125rem", fontWeight: 600 }}>{giftOptions.recipientName}</p>
            ) : null}
            <p style={{ margin: 0, color: "#374151" }}>{shippingAddress}</p>
          </div>
          <div>
            <h4 style={{ margin: "0 0 0.25rem", color: "#6b7280", textTransform: "uppercase", fontSize: "0.75rem" }}>
              Buyer Reference:
            </h4>
            <p style={{ margin: 0, fontFamily: "monospace", fontSize: "0.8125rem", color: "#374151" }}>
              {buyer}
            </p>
          </div>
        </div>

        {/* Price hidden notice */}
        {hidePricing && (
          <div
            data-testid="packing-slip-price-hidden-notice"
            style={{
              padding: "0.5rem 0.75rem",
              background: "#f3f4f6",
              borderRadius: "0.375rem",
              fontSize: "0.8125rem",
              color: "#4b5563",
              fontStyle: "italic",
            }}
          >
            Item prices and totals are hidden on this packing slip as requested by the buyer.
          </div>
        )}

        {/* Items Table */}
        <div style={{ overflowX: "auto" }}>
          <table
            data-testid="packing-slip-items-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.875rem",
              textAlign: "left",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                <th style={{ padding: "0.5rem 0", fontWeight: 700 }}>Item</th>
                <th style={{ padding: "0.5rem 0", fontWeight: 700, textAlign: "center" }}>Qty</th>
                {!hidePricing && (
                  <>
                    <th style={{ padding: "0.5rem 0", fontWeight: 700, textAlign: "right" }} data-testid="packing-slip-th-price">
                      Unit Price
                    </th>
                    <th style={{ padding: "0.5rem 0", fontWeight: 700, textAlign: "right" }} data-testid="packing-slip-th-total">
                      Total
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={`${item.name}-${idx}`} style={{ borderBottom: "1px solid #f3f4f6" }} data-testid={`packing-slip-item-${idx}`}>
                  <td style={{ padding: "0.625rem 0" }}>{item.name}</td>
                  <td style={{ padding: "0.625rem 0", textAlign: "center" }}>{item.quantity}</td>
                  {!hidePricing && (
                    <>
                      <td style={{ padding: "0.625rem 0", textAlign: "right" }} data-testid={`packing-slip-item-price-${idx}`}>
                        {formatStroops(item.priceStroops)}
                      </td>
                      <td style={{ padding: "0.625rem 0", textAlign: "right" }} data-testid={`packing-slip-item-total-${idx}`}>
                        {item.priceStroops ? formatStroops(BigInt(item.priceStroops) * BigInt(item.quantity)) : "—"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pricing Totals (only when NOT hidden) */}
        {!hidePricing && (
          <div
            data-testid="packing-slip-totals"
            style={{
              display: "flex",
              justifyContent: "flex-end",
              paddingTop: "0.5rem",
              borderTop: "1px solid #e5e7eb",
              fontSize: "0.9375rem",
              fontWeight: 700,
            }}
          >
            <span>
              Total:{" "}
              <span data-testid="packing-slip-total-amount">
                {"amountStroops" in order
                  ? formatStroops(order.amountStroops)
                  : "totalStroops" in order
                  ? formatStroops(order.totalStroops)
                  : "—"}
              </span>
            </span>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }} className="no-print">
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.875rem",
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            data-testid="print-packing-slip-btn"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#2563eb",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.875rem",
            }}
          >
            Print packing slip
          </button>
        </div>
      </div>
    </div>
  );
}
