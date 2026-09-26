"use client";

import { useState } from "react";
import { Amount } from "@delegolabs/ui";
import { useCurrency } from "../../hooks/useCurrency";
import {
  formatTaxRate,
  isZeroRated,
  type TaxBreakdown,
} from "../../lib/taxBreakdown";
import { receiptStroops } from "../../lib/receiptInvoice";

export interface TaxBreakdownPanelProps {
  breakdown: TaxBreakdown;
  /** Stellar network fee in stroops — shown but excluded from the taxable base. */
  networkFeeStroops?: string;
  /** Starts expanded on checkout, collapsed on receipts. */
  defaultExpanded?: boolean;
  /** `checkout` adds the "estimated" caveat; `receipt` does not. */
  variant?: "checkout" | "receipt";
}

function toStroops(value: string): bigint {
  return receiptStroops(value);
}

/**
 * Collapsible tax summary for order checkout and receipts (#723).
 *
 * Always renders base price → tax → total, and expands to add the network fee
 * and the jurisdiction detail. Non-taxable digital goods show an explicit
 * "0% — non-taxable" line rather than hiding the section, so a buyer can see
 * that zero tax was considered and not merely omitted.
 */
export function TaxBreakdownPanel({
  breakdown,
  networkFeeStroops = "0",
  defaultExpanded = false,
  variant = "checkout",
}: TaxBreakdownPanelProps) {
  const { currencyId, rate } = useCurrency();
  const [expanded, setExpanded] = useState(defaultExpanded);

  const xlmUsdRate = rate?.xlmUsdRate;
  const zeroRated = isZeroRated(breakdown);
  const fee = toStroops(networkFeeStroops);

  function amount(stroops: bigint) {
    return (
      <Amount stroops={stroops} currency={currencyId} xlmUsdRate={xlmUsdRate} />
    );
  }

  return (
    <div
      className="tax-breakdown"
      data-testid="tax-breakdown"
      style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}
    >
      <div className="wallet-detail-row">
        <dt style={{ color: "var(--color-text-muted, #6b7280)" }}>Subtotal</dt>
        <dd data-testid="tax-subtotal">{amount(toStroops(breakdown.subtotalStroops))}</dd>
      </div>

      <div className="wallet-detail-row">
        <dt style={{ color: "var(--color-text-muted, #6b7280)" }}>
          Estimated tax
          <span
            data-testid="tax-rate"
            style={{ marginLeft: "0.375rem", fontSize: "0.75rem" }}
          >
            ({formatTaxRate(breakdown.taxRatePercent)})
          </span>
        </dt>
        <dd data-testid="tax-amount">{amount(toStroops(breakdown.taxAmountStroops))}</dd>
      </div>

      <div
        className="wallet-detail-row"
        style={{
          borderTop: "1px solid var(--color-border, #e5e7eb)",
          paddingTop: "0.375rem",
        }}
      >
        <dt style={{ fontWeight: 600 }}>Total</dt>
        <dd style={{ fontWeight: 600 }} data-testid="tax-total">
          {amount(toStroops(breakdown.totalStroops))}
        </dd>
      </div>

      {fee > 0n && (
        <div className="wallet-detail-row">
          <dt style={{ color: "var(--color-text-muted, #6b7280)" }}>Network fee</dt>
          <dd data-testid="tax-network-fee">{amount(fee)}</dd>
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "0.8125rem",
          color: "var(--color-accent, #2563eb)",
          padding: 0,
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          alignSelf: "flex-start",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: expanded ? "rotate(90deg)" : "none",
            transition: "transform 0.15s ease",
          }}
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {expanded ? "Hide" : "Show"} tax details
      </button>

      {expanded && (
        <dl
          data-testid="tax-breakdown-detail"
          style={{
            marginTop: "0.125rem",
            paddingLeft: "0.75rem",
            borderLeft: "2px solid var(--color-border, #e5e7eb)",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            fontSize: "0.8125rem",
          }}
        >
          <div className="wallet-detail-row">
            <dt style={{ color: "var(--color-text-muted, #6b7280)" }}>Jurisdiction</dt>
            <dd data-testid="tax-jurisdiction">{breakdown.jurisdiction}</dd>
          </div>
          <div className="wallet-detail-row">
            <dt style={{ color: "var(--color-text-muted, #6b7280)" }}>Taxable base</dt>
            <dd data-testid="taxable-base">
              {amount(toStroops(breakdown.subtotalStroops))}
            </dd>
          </div>
          {fee > 0n && (
            <div className="wallet-detail-row">
              <dt style={{ color: "var(--color-text-muted, #6b7280)" }}>
                Network fee (excluded from tax)
              </dt>
              <dd>{amount(fee)}</dd>
            </div>
          )}
          <p
            data-testid="tax-caveat"
            style={{ margin: "0.25rem 0 0", color: "var(--color-text-muted, #6b7280)" }}
          >
            {zeroRated
              ? `${breakdown.jurisdiction} — no tax is charged on this purchase.`
              : variant === "checkout"
                ? "Estimated from the buyer's jurisdiction. The amount charged is fixed at settlement."
                : "Estimated from the buyer's jurisdiction."}
          </p>
        </dl>
      )}
    </div>
  );
}
