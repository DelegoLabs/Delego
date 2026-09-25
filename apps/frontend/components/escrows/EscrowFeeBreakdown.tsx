"use client";

import { useState } from "react";
import { Amount } from "@delegolabs/ui";
import type { CurrencyId } from "../../lib/currencies";
import { useCurrency } from "../../hooks/useCurrency";
import {
  computeEscrowFeeBreakdown,
  formatBps,
  type TreasuryFeeConfig,
} from "../../lib/escrowFees";

export interface EscrowFeeBreakdownProps {
  /** Gross locked amount in stroops. */
  grossStroops: bigint;
  /**
   * Per-treasury fee config. When null/undefined the section renders "—"
   * rather than zeros, honoring the "no false precision" requirement.
   */
  treasuries?: TreasuryFeeConfig[] | null;
  /**
   * When true, suppresses the expandable multi-treasury detail even if
   * there is more than one treasury. Useful on receipt views where space
   * is tight.
   */
  collapseBreakdown?: boolean;
}

/**
 * Fee line for escrow detail and receipts.
 *
 * Renders: gross → fee amount (+ % or "estimated" badge) → net proceeds.
 * When multiple treasuries apply and data is available, an expandable
 * section shows the per-treasury breakdown.
 *
 * Missing config renders "—" instead of zeros — no false precision.
 */
export function EscrowFeeBreakdown({
  grossStroops,
  treasuries,
  collapseBreakdown = false,
}: EscrowFeeBreakdownProps) {
  const { currencyId, rate } = useCurrency();
  const [expanded, setExpanded] = useState(false);

  const breakdown = computeEscrowFeeBreakdown(grossStroops, treasuries);

  const xlmUsdRate = rate?.xlmUsdRate;
  const currency = currencyId as CurrencyId;

  // ── Helper: amount cell or "—" placeholder ───────────────────────────────
  function AmountOrDash({
    stroops,
    testId,
  }: {
    stroops: bigint | null;
    testId?: string;
  }) {
    if (stroops === null) {
      return (
        <span
          data-testid={testId}
          aria-label="Amount unavailable"
          style={{ color: "var(--color-text-muted, #9ca3af)" }}
        >
          —
        </span>
      );
    }
    return (
      <Amount
        stroops={stroops}
        currency={currency}
        xlmUsdRate={xlmUsdRate}
        data-testid={testId}
      />
    );
  }

  return (
    <div
      data-testid="escrow-fee-breakdown"
      style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}
    >
      {/* Gross */}
      <div className="wallet-detail-row">
        <dt style={{ color: "var(--color-text-muted, #6b7280)" }}>Gross amount</dt>
        <dd>
          <Amount stroops={grossStroops} currency={currency} xlmUsdRate={xlmUsdRate} />
        </dd>
      </div>

      {/* Fee line */}
      <div className="wallet-detail-row">
        <dt style={{ color: "var(--color-text-muted, #6b7280)" }}>
          Platform fee
          {breakdown.hasEstimate && !breakdown.configAbsent && (
            <span
              data-testid="estimated-fee-badge"
              title="Fee is calculated on-chain at release time"
              style={{
                marginLeft: "0.375rem",
                fontSize: "0.6875rem",
                fontWeight: 600,
                padding: "0.1rem 0.375rem",
                borderRadius: "0.25rem",
                background: "var(--color-info-bg, #eff6ff)",
                color: "var(--color-info-text, #1d4ed8)",
                border: "1px solid var(--color-info-border, #bfdbfe)",
                verticalAlign: "middle",
              }}
            >
              estimated
            </span>
          )}
        </dt>
        <dd>
          {breakdown.configAbsent ? (
            <span
              data-testid="fee-amount-unavailable"
              aria-label="Fee amount unavailable"
              style={{ color: "var(--color-text-muted, #9ca3af)" }}
            >
              —
            </span>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
              <AmountOrDash stroops={breakdown.totalFeeStroops} testId="fee-total-amount" />
              {/* Show % when it's a single static rate */}
              {breakdown.lines.length === 1 &&
                breakdown.lines[0].bps !== undefined &&
                !breakdown.lines[0].isEstimate && (
                  <span
                    style={{ fontSize: "0.8125rem", color: "var(--color-text-muted, #6b7280)" }}
                  >
                    ({formatBps(breakdown.lines[0].bps)})
                  </span>
                )}
            </span>
          )}
        </dd>
      </div>

      {/* Net proceeds */}
      <div
        className="wallet-detail-row"
        style={{ borderTop: "1px solid var(--color-border, #e5e7eb)", paddingTop: "0.375rem" }}
      >
        <dt style={{ fontWeight: 600 }}>Net proceeds</dt>
        <dd style={{ fontWeight: 600 }}>
          <AmountOrDash stroops={breakdown.netStroops} testId="net-proceeds-amount" />
        </dd>
      </div>

      {/* Expandable multi-treasury breakdown */}
      {!collapseBreakdown &&
        breakdown.lines.length > 1 &&
        !breakdown.configAbsent && (
          <div style={{ marginTop: "0.25rem" }}>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
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
              {expanded ? "Hide" : "Show"} fee breakdown
              {` (${breakdown.lines.length} recipients)`}
            </button>

            {expanded && (
              <dl
                data-testid="fee-breakdown-detail"
                style={{
                  marginTop: "0.375rem",
                  paddingLeft: "0.75rem",
                  borderLeft: "2px solid var(--color-border, #e5e7eb)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                {breakdown.lines.map((line, i) => (
                  <div
                    key={`fee-line-${i}`}
                    className="wallet-detail-row"
                    style={{ fontSize: "0.8125rem" }}
                  >
                    <dt style={{ color: "var(--color-text-muted, #6b7280)" }}>
                      {line.label}
                      {line.bps !== undefined && (
                        <span style={{ marginLeft: "0.25rem" }}>
                          ({formatBps(line.bps)})
                        </span>
                      )}
                      {line.isEstimate && (
                        <span
                          style={{
                            marginLeft: "0.25rem",
                            fontSize: "0.6875rem",
                            color: "var(--color-info-text, #1d4ed8)",
                          }}
                        >
                          est.
                        </span>
                      )}
                    </dt>
                    <dd>
                      <AmountOrDash stroops={line.amount} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
    </div>
  );
}
