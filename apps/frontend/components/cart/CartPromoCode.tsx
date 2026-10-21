"use client";

import type { useCartPromoCode } from "../../hooks/useCartPromoCode";
import { formatPromoStroops } from "../../lib/promoCode";

export function CartPromoCode({
  coupon,
}: {
  coupon: ReturnType<typeof useCartPromoCode>;
}) {
  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void coupon.apply();
        }}
      >
        {coupon.merchants.length > 1 && (
          <label
            style={{
              display: "grid",
              gap: "0.25rem",
              marginBottom: "0.5rem",
              fontSize: "0.8125rem",
            }}
          >
            Apply coupon to merchant
            <select
              value={coupon.merchantId}
              onChange={(event) => coupon.setMerchantId(event.target.value)}
            >
              {coupon.merchants.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label
          htmlFor="cart-promo-code"
          style={{
            display: "block",
            fontSize: "0.8125rem",
            fontWeight: 600,
            marginBottom: "0.375rem",
          }}
        >
          Promo code
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            id="cart-promo-code"
            value={coupon.code}
            onChange={(event) => coupon.setCode(event.target.value)}
            placeholder="Enter a promo code"
            autoComplete="off"
            spellCheck={false}
            maxLength={128}
            aria-invalid={Boolean(coupon.error)}
            aria-describedby={coupon.error ? "cart-promo-error" : undefined}
            style={{
              minWidth: 0,
              flex: 1,
              padding: "0.5rem",
              border: "1px solid #9ca3af",
              borderRadius: "0.375rem",
              color: "#111827",
            }}
          />
          <button
            type="submit"
            disabled={!coupon.code.trim() || coupon.pending}
            style={{
              padding: "0.5rem 0.75rem",
              border: "1px solid #2563eb",
              borderRadius: "0.375rem",
              background: "#eff6ff",
              color: "#1d4ed8",
              fontWeight: 600,
            }}
          >
            {coupon.pending ? "Checking…" : "Apply"}
          </button>
        </div>
      </form>
      {coupon.error && (
        <p
          id="cart-promo-error"
          role="alert"
          style={{ margin: 0, color: "#b91c1c", fontSize: "0.8125rem" }}
        >
          {coupon.error}
        </p>
      )}
      {coupon.applied && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            borderRadius: "0.5rem",
            padding: "0.5rem 0.625rem",
            background: "#ecfdf5",
            color: "#065f46",
            fontSize: "0.8125rem",
          }}
        >
          <span>
            <strong>{coupon.applied.discount.code}</strong> applied: −
            {formatPromoStroops(coupon.applied.discount.appliedDiscountStroops)}
          </span>
          <button
            type="button"
            onClick={coupon.remove}
            aria-label="Remove promo code"
            style={{
              background: "transparent",
              border: 0,
              color: "#065f46",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
