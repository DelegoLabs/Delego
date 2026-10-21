"use client";

import { useEffect, useRef, useState } from "react";
import {
  availableToSell,
  resolveStockPhase,
  stockBadgeText,
  submitRestockRequest,
  type StockDepletionInfo,
} from "../../lib/stockDepletion";

import styles from "./StockDepletionPanel.module.css";

const badgeColors: Record<string, { bg: string; fg: string }> = {
  low: { bg: "#fffbeb", fg: "#b45309" },
  backorder: { bg: "#eff6ff", fg: "#1d4ed8" },
  out_of_stock: { bg: "#fef2f2", fg: "#b91c1c" },
};

export function StockDepletionPanel({
  merchantId,
  stock,
  mode,
  loading = stock == null,
  showSkeletonWhileLoading = true,
}: {
  merchantId: string;
  stock: StockDepletionInfo | null;
  loading?: boolean;
  showSkeletonWhileLoading?: boolean;
  mode: "card" | "detail";
}) {
  const available = stock ? availableToSell(stock) : null;
  const phase = stock ? resolveStockPhase(stock) : null;
  const badge = stock ? stockBadgeText(stock) : null;
  const colors = phase ? badgeColors[phase] : undefined;
  const previous = useRef(available);
  const [dropping, setDropping] = useState(false);
  const [email, setEmail] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const decreased =
      available !== null &&
      previous.current !== null &&
      available < previous.current;
    previous.current = available;
    setDropping(decreased);
    if (!decreased) return;
    const timer = window.setTimeout(() => setDropping(false), 600);
    return () => window.clearTimeout(timer);
  }, [available]);

  const pending = loading && !stock;
  const outOfStock = phase === "out_of_stock";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div
        className={`min-h-[2rem] ${styles.badgeSlot}`}
        aria-busy={pending}
        aria-live="polite"
        data-testid="stock-badge-slot"
      >
        {pending && (
          <span className={styles.srOnly}>Checking availability</span>
        )}
        {pending && showSkeletonWhileLoading && (
          <span
            className={styles.skeleton}
            aria-hidden="true"
            data-testid="stock-skeleton"
          />
        )}
        {badge && colors && (
          <span
            key={badge}
            className={styles.badge}
            data-testid="stock-depletion-badge"
            style={{
              alignSelf: "flex-start",
              padding: "0.125rem 0.5rem",
              borderRadius: "999px",
              background: colors.bg,
              color: colors.fg,
              fontSize: "0.75rem",
              fontWeight: 700,
            }}
          >
            {badge}
          </span>
        )}
      </div>
      {mode === "detail" && (
        <p
          className={styles.countdown}
          data-testid="stock-countdown"
          style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: dropping ? "#b91c1c" : "#111827",
          }}
        >
          {available !== null
            ? `${available} left`
            : pending
              ? "Checking stock..."
              : "Stock unavailable"}
          {stock && stock.reservedStock > 0
            ? ` · ${stock.reservedStock} reserved`
            : ""}
        </p>
      )}
      <details
        className={styles.restock}
        style={{ visibility: outOfStock ? "visible" : "hidden" }}
        aria-hidden={!outOfStock}
      >
        <summary>Notify Me When Available</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!stock || !outOfStock) return;
            void submitRestockRequest({
              merchantId,
              productId: stock.productId,
              email,
              publicKey,
            }).then((result) => {
              if (!result.ok) {
                setMessage(result.message);
                return;
              }
              setDone(true);
              setMessage("We'll notify you when this item is back.");
            });
          }}
          style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}
        >
          <input
            type="email"
            aria-label="Restock email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={{
              padding: "0.375rem 0.5rem",
              borderRadius: "0.375rem",
              border: "1px solid #d1d5db",
            }}
          />
          <input
            aria-label="Restock Stellar public key"
            placeholder="Stellar public key"
            value={publicKey}
            onChange={(event) => setPublicKey(event.target.value)}
            style={{
              padding: "0.375rem 0.5rem",
              borderRadius: "0.375rem",
              border: "1px solid #d1d5db",
            }}
          />
          <button
            type="submit"
            disabled={done}
            style={{ alignSelf: "flex-start", cursor: "pointer" }}
          >
            Notify me
          </button>
          {message && (
            <p
              role="status"
              style={{
                margin: 0,
                fontSize: "0.75rem",
                color: done ? "#047857" : "#b91c1c",
              }}
            >
              {message}
            </p>
          )}
        </form>
      </details>
    </div>
  );
}
