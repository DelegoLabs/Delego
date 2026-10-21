"use client";

/**
 * Slide-out shopping cart drawer (#917).
 *
 * Accessible: uses role="dialog" + aria-modal, focus-trap on open,
 * Escape key to close. Quantity controls are labelled buttons.
 * Stroop subtotal is computed via BigInt in the CartProvider.
 */

import { useEffect, useRef, useState } from "react";
import { useCart } from "../../hooks/useCart";
import type { CartItem } from "../../lib/cart";
import { MultiMerchantCheckout, type MultiMerchantCheckoutProps } from "./MultiMerchantCheckout";
import { CartPromoCode } from "./CartPromoCode";
import { useCartPromoCode } from "../../hooks/useCartPromoCode";
import { formatPromoStroops } from "../../lib/promoCode";

const STROOPS_PER_XLM = 10_000_000n;
const MAX_QUANTITY = 99;
const QUANTITY_DEBOUNCE_MS = 250;

function formatStroops(stroops: string): string {
  try {
    return formatPromoStroops(stroops);
  } catch {
    return stroops;
  }
}

function formatItemPrice(priceStroops: string, quantity: number): string {
  try {
    const total = BigInt(priceStroops) * BigInt(quantity);
    return formatStroops(total.toString());
  } catch {
    return priceStroops;
  }
}

function clampQuantity(value: number, maxStock: number): number {
  const upperBound = Math.min(maxStock, MAX_QUANTITY);
  if (!Number.isFinite(value)) return 1;
  const truncated = Math.trunc(value);
  if (truncated < 1) return 1;
  if (truncated > upperBound) return upperBound;
  return truncated;
}

function sanitizeQuantityInput(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

interface QuantityControlProps {
  item: CartItem;
}

function QuantityControl({ item }: QuantityControlProps) {
  const { setQuantity, removeItem } = useCart();

  const maxQuantity = Math.min(item.maxStock, MAX_QUANTITY);
  const [inputValue, setInputValue] = useState<string>(String(item.quantity));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local input in sync when the cart quantity changes externally
  useEffect(() => {
    setInputValue(String(item.quantity));
  }, [item.quantity]);

  // Clear any pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const scheduleQuantityChange = (nextQuantity: number) => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      setQuantity(item.productId, clampQuantity(nextQuantity, item.maxStock));
    }, QUANTITY_DEBOUNCE_MS);
  };

  const decrement = () => {
    if (item.quantity <= 1) {
      removeItem(item.productId);
    } else {
      const next = clampQuantity(item.quantity - 1, item.maxStock);
      setInputValue(String(next));
      scheduleQuantityChange(next);
    }
  };

  const increment = () => {
    const next = clampQuantity(item.quantity + 1, item.maxStock);
    setInputValue(String(next));
    scheduleQuantityChange(next);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeQuantityInput(e.target.value);
    setInputValue(sanitized);
    if (sanitized === "") return;
    const parsed = Number.parseInt(sanitized, 10);
    if (!Number.isFinite(parsed)) return;
    scheduleQuantityChange(parsed);
  };

  const handleInputBlur = () => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const parsed = Number.parseInt(inputValue, 10);
    const clamped = clampQuantity(Number.isFinite(parsed) ? parsed : item.quantity, item.maxStock);
    setInputValue(String(clamped));
    if (clamped !== item.quantity) {
      setQuantity(item.productId, clamped);
    }
  };

  const atMax = item.quantity >= maxQuantity;

  return (
    <div
      role="group"
      aria-label={`Quantity for ${item.title}`}
      style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}
    >
      <button
        type="button"
        aria-label={`Decrease quantity of ${item.title}`}
        onClick={decrement}
        style={btnStyle}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`Quantity for ${item.title}`}
        aria-live="polite"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        style={{
          width: "2.5rem",
          textAlign: "center",
          fontWeight: 600,
          fontSize: "0.875rem",
          border: "1px solid #d1d5db",
          borderRadius: "0.375rem",
          padding: "0.125rem 0.25rem",
        }}
      />
      <button
        type="button"
        aria-label={`Increase quantity of ${item.title}${atMax ? " (maximum reached)" : ""}`}
        onClick={increment}
        disabled={atMax}
        title={atMax ? `Maximum stock: ${maxQuantity}` : undefined}
        style={{ ...btnStyle, opacity: atMax ? 0.4 : 1, cursor: atMax ? "not-allowed" : "pointer" }}
      >
        +
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.75rem",
  height: "1.75rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  background: "#f9fafb",
  fontWeight: 700,
  fontSize: "1rem",
  lineHeight: 1,
  cursor: "pointer",
  color: "#374151",
};

export { clampQuantity, sanitizeQuantityInput, MAX_QUANTITY };

export function CartDrawer({ signEscrow, refundEscrow }: Pick<MultiMerchantCheckoutProps, "signEscrow" | "refundEscrow"> = {}) {
  const { summary, drawerOpen, closeDrawer, removeItem, clearCart } = useCart();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const coupon = useCartPromoCode(summary.items);

  const [recoveryRequired, setRecoveryRequired] = useState(false);

  // Focus the close button when drawer opens
  useEffect(() => {
    if (drawerOpen) {
      closeBtnRef.current?.focus();
    }
  }, [drawerOpen]);

  // Close on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !recoveryRequired) closeDrawer();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [drawerOpen, closeDrawer, recoveryRequired]);

  // Prevent body scroll when open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  if (!drawerOpen) return null;

  const { items, subtotalStroops, totalQuantity } = summary;

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        aria-hidden="true"
        onClick={() => { if (!recoveryRequired) closeDrawer(); }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 1000,
        }}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        data-testid="cart-drawer"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(100vw, 26rem)",
          background: "#fff",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
            Cart
            {totalQuantity > 0 && (
              <span
                aria-label={`${totalQuantity} items`}
                style={{
                  marginLeft: "0.5rem",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "1.5rem",
                  height: "1.5rem",
                  borderRadius: "9999px",
                  background: "#2563eb",
                  color: "#fff",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                {totalQuantity}
              </span>
            )}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Close cart"
            disabled={recoveryRequired}
            onClick={() => { if (!recoveryRequired) closeDrawer(); }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "2rem",
              height: "2rem",
              borderRadius: "0.375rem",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "1.25rem",
              color: "#6b7280",
            }}
          >
            ✕
          </button>
        </div>

        {/* Item list or checkout flow */}
        <div
          style={{ flex: 1, overflowY: "auto", padding: "1rem 1.25rem" }}
        >
          {checkingOut ? (
            <MultiMerchantCheckout
              promoCode={coupon.applied ?? undefined}
              onRecoveryRequiredChange={setRecoveryRequired}
              signEscrow={signEscrow}
              refundEscrow={refundEscrow}
              onCancel={() => {
                setRecoveryRequired(false);
                setCheckingOut(false);
              }}
              onComplete={() => {
                setRecoveryRequired(false);
                setCheckingOut(false);
                closeDrawer();
              }}
            />
          ) : (
            <div role="list" aria-label="Cart items">
          {items.length === 0 ? (
            <p
              style={{
                color: "#6b7280",
                textAlign: "center",
                marginTop: "3rem",
                fontSize: "0.9375rem",
              }}
            >
              Your cart is empty.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.productId}
                role="listitem"
                data-testid={`cart-item-${item.productId}`}
                style={{
                  display: "flex",
                  gap: "0.875rem",
                  paddingBottom: "1rem",
                  marginBottom: "1rem",
                  borderBottom: "1px solid #f3f4f6",
                }}
              >
                {/* Thumbnail */}
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    width={56}
                    height={56}
                    style={{ borderRadius: "0.5rem", objectFit: "cover", flexShrink: 0 }}
                  />
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: "0 0 0.25rem",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.title}
                  </p>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "#6b7280" }}>
                    {item.merchantName}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <QuantityControl item={item} />
                    <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827" }}>
                      {formatItemPrice(item.priceStroops, item.quantity)}
                    </span>
                  </div>
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  aria-label={`Remove ${item.title} from cart`}
                  onClick={() => removeItem(item.productId)}
                  style={{
                    alignSelf: "flex-start",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "#9ca3af",
                    fontSize: "1rem",
                    padding: "0.125rem",
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
            ))
          )}
            </div>
          )}
        </div>

        {/* Footer — subtotal + actions */}
        {!checkingOut && items.length > 0 && (
          <div
            style={{
              padding: "1rem 1.25rem",
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <CartPromoCode coupon={coupon} />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Subtotal</span>
              <span
                data-testid="cart-subtotal"
                style={{ fontWeight: 700, fontSize: "1rem" }}
              >
                {formatPromoStroops(
                  (
                    BigInt(subtotalStroops) -
                    BigInt(coupon.applied?.discount.appliedDiscountStroops ?? "0")
                  ).toString()
                )}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280" }}>
              Funds are held in escrow until delivery is confirmed.
            </p>

            <button
              type="button"
              onClick={clearCart}
              style={{
                background: "transparent",
                border: "none",
                color: "#dc2626",
                fontSize: "0.8125rem",
                cursor: "pointer",
                padding: 0,
                textAlign: "left",
              }}
            >
              Clear cart
            </button>

            <button
              type="button"
              onClick={() => setCheckingOut(true)}
              disabled={coupon.pending}
              data-testid="proceed-to-checkout"
              style={{
                padding: "0.625rem 1rem",
                borderRadius: "0.5rem",
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.9375rem",
                cursor: "pointer",
              }}
            >
              Proceed to checkout
            </button>
          </div>
        )}
      </div>
    </>
  );
}
