"use client";

/**
 * Offline cart conflict resolution (#1017).
 *
 * Shown whenever `useCart` reports lines whose cached (offline) price or
 * quantity no longer matches the live storefront. Each line must be settled
 * explicitly — accept the server's terms or remove it — and checkout stays
 * blocked (`useCart().canCheckout`) until the list is empty. There is no
 * dismiss action on purpose: closing without resolving would just leave
 * checkout disabled with no explanation.
 */

import { useRef } from "react";
import { useCart, type CartConflictItem } from "../hooks/useCart";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { formatPromoStroops } from "../lib/promoCode";

function formatStroops(stroops: string): string {
  try {
    return formatPromoStroops(stroops);
  } catch {
    return stroops;
  }
}

function describeConflict(conflict: CartConflictItem): string {
  switch (conflict.conflictType) {
    case "out_of_stock":
      return "This item is no longer available.";
    case "insufficient_quantity":
      return `Only ${conflict.availableStock} left — you have ${conflict.cachedQuantity} in your cart.`;
    case "price_changed":
      return `Price changed from ${formatStroops(
        conflict.cachedPriceStroops
      )} to ${formatStroops(conflict.serverPriceStroops)}.`;
  }
}

function acceptLabel(conflict: CartConflictItem): string | null {
  switch (conflict.conflictType) {
    case "out_of_stock":
      return null;
    case "insufficient_quantity":
      return `Reduce to ${conflict.availableStock}`;
    case "price_changed":
      return "Accept New Price";
  }
}

export function CartConflictModal() {
  const { conflicts, resolveConflict } = useCart();
  const panelRef = useRef<HTMLDivElement>(null);
  const open = conflicts.length > 0;
  useFocusTrap({ containerRef: panelRef, isActive: open });

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1200,
        padding: "1rem",
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cart-conflict-title"
        aria-describedby="cart-conflict-body"
        tabIndex={-1}
        data-testid="cart-conflict-modal"
        style={{
          maxWidth: "480px",
          width: "100%",
          maxHeight: "calc(100vh - 2rem)",
          overflowY: "auto",
          background: "var(--color-bg-surface, #fff)",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        }}
      >
        <h2
          id="cart-conflict-title"
          style={{ margin: "0 0 0.5rem", fontSize: "1.125rem" }}
        >
          Your cart changed while you were offline
        </h2>
        <p
          id="cart-conflict-body"
          style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "#4b5563" }}
        >
          Review {conflicts.length === 1 ? "this item" : "these items"} before
          checking out. Checkout is paused until every change is resolved.
        </p>

        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {conflicts.map((conflict) => {
            const accept = acceptLabel(conflict);
            return (
              <li
                key={conflict.productId}
                data-testid={`cart-conflict-${conflict.productId}`}
                data-conflict-type={conflict.conflictType}
                style={{
                  borderTop: "1px solid #e5e7eb",
                  padding: "0.75rem 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <strong style={{ fontSize: "0.9375rem" }}>
                  {conflict.title}
                </strong>
                <span style={{ fontSize: "0.8125rem", color: "#b45309" }}>
                  {describeConflict(conflict)}
                </span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {accept && (
                    <button
                      type="button"
                      onClick={() =>
                        resolveConflict(conflict.productId, "accept")
                      }
                      style={{
                        padding: "0.375rem 0.75rem",
                        borderRadius: "0.375rem",
                        border: "none",
                        background: "#2563eb",
                        color: "#fff",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {accept}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${conflict.title}`}
                    onClick={() =>
                      resolveConflict(conflict.productId, "remove")
                    }
                    style={{
                      padding: "0.375rem 0.75rem",
                      borderRadius: "0.375rem",
                      border: "1px solid #dc2626",
                      background: "transparent",
                      color: "#dc2626",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default CartConflictModal;
