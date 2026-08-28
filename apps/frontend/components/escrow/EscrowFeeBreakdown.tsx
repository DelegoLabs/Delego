"use client";

import { useState } from "react";
import type { EscrowFeeSummary } from "@delego/types";
import { Badge } from "@delego/ui";
import { stroopsToDisplay } from "@delego/utils";

const DASH = "—";

function formatStroopsOrDash(
  stroops: bigint | null | undefined,
  decimals = 7
): string {
  if (stroops === null || stroops === undefined) return DASH;
  return stroopsToDisplay(stroops, decimals);
}

function bpsToPercent(bps: number | null): string | null {
  if (bps === null) return null;
  return `${(bps / 100).toFixed(2)}%`;
}

export interface EscrowFeeBreakdownProps {
  fees: EscrowFeeSummary | null;
  compact?: boolean;
}

export function EscrowFeeBreakdown({ fees, compact = false }: EscrowFeeBreakdownProps) {
  const [expanded, setExpanded] = useState(false);

  if (!fees) {
    return (
      <div
        data-testid="fee-breakdown-missing"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.375rem",
          padding: compact ? "0" : "0.75rem 1rem",
          border: compact ? "none" : "1px dashed #d1d5db",
          borderRadius: "0.375rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: compact ? "0.8125rem" : "0.875rem",
          }}
        >
          <span style={{ color: "#6b7280" }}>Gross amount</span>
          <span style={{ fontVariantNumeric: "tabular-nums", color: "#6b7280" }}>{DASH}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: compact ? "0.8125rem" : "0.875rem",
          }}
        >
          <span style={{ color: "#6b7280" }}>Platform fees</span>
          <span style={{ fontVariantNumeric: "tabular-nums", color: "#6b7280" }}>{DASH}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: compact ? "0.125rem" : "0.5rem",
            borderTop: compact ? "none" : "1px solid #e5e7eb",
            fontWeight: 600,
            fontSize: compact ? "0.875rem" : "1rem",
          }}
        >
          <span>Net proceeds to seller</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{DASH}</span>
        </div>
        {!compact && (
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#9ca3af" }}>
            Fee schedule is not yet configured for this escrow.
          </p>
        )}
      </div>
    );
  }

  const hasMultipleLines = fees.lines.length > 1;
  const feePercent =
    fees.grossStroops > 0n && !fees.hasEstimates
      ? bpsToPercent(
          Math.round(
            Number((fees.totalFeeStroops * 10000n) / fees.grossStroops)
          )
        )
      : null;

  return (
    <div
      data-testid="fee-breakdown"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.375rem",
        padding: compact ? "0" : "0.75rem 1rem",
        border: compact ? "none" : "1px solid #e5e7eb",
        borderRadius: "0.5rem",
        background: compact ? "transparent" : "#fafafa",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: compact ? "0.8125rem" : "0.875rem",
        }}
      >
        <span style={{ color: "#374151" }}>Gross amount</span>
        <span
          data-testid="fee-gross"
          style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}
        >
          {formatStroopsOrDash(fees.grossStroops)} XLM
        </span>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: compact ? "0.8125rem" : "0.875rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <span style={{ color: "#374151" }}>Platform fees</span>
          {fees.hasEstimates && (
            <Badge variant="estimated" title="Fees are estimates until settlement">
              Estimated
            </Badge>
          )}
          {!fees.hasEstimates && feePercent && (
            <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
              ({feePercent})
            </span>
          )}
        </div>
        <span
          data-testid="fee-total"
          style={{
            fontVariantNumeric: "tabular-nums",
            color: "#b91c1c",
            fontWeight: 500,
          }}
        >
          −{formatStroopsOrDash(fees.totalFeeStroops)} XLM
        </span>
      </div>

      {hasMultipleLines && !compact && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls="fee-breakdown-lines"
            style={{
              alignSelf: "flex-start",
              padding: "0",
              border: "none",
              background: "transparent",
              color: "#2563eb",
              fontSize: "0.8125rem",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {expanded ? "Hide per-treasury breakdown ▲" : "Show per-treasury breakdown ▼"}
          </button>
          {expanded && (
            <ul
              id="fee-breakdown-lines"
              role="list"
              data-testid="fee-breakdown-lines"
              style={{
                listStyle: "none",
                padding: "0.5rem 0 0 0.5rem",
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.375rem",
              }}
            >
              {fees.lines.map((line, idx) => {
                const pct = bpsToPercent(line.feePercentageBps);
                return (
                  <li
                    key={`${line.treasuryName}-${idx}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: "1rem",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <span style={{ color: "#4b5563" }}>{line.treasuryName}</span>
                      {line.estimated && (
                        <Badge variant="estimated">Est</Badge>
                      )}
                      {!line.estimated && pct && (
                        <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                          {pct}
                        </span>
                      )}
                    </div>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: "#374151" }}>
                      −{formatStroopsOrDash(line.feeStroops)} XLM
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: compact ? "0.125rem" : "0.5rem",
          marginTop: compact ? "0" : "0.125rem",
          borderTop: compact ? "none" : "1px solid #d1d5db",
          fontWeight: 600,
          fontSize: compact ? "0.875rem" : "1rem",
        }}
      >
        <span>Net proceeds to seller</span>
        <span
          data-testid="fee-net"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatStroopsOrDash(fees.netProceedsStroops)} XLM
        </span>
      </div>
    </div>
  );
}

export interface EscrowReceiptProps {
  orderId: string;
  escrowId: string;
  grossStroops: bigint;
  fees: EscrowFeeSummary | null;
}

export function EscrowReceipt({ orderId, escrowId, grossStroops, fees }: EscrowReceiptProps) {
  return (
    <div
      data-testid="escrow-receipt"
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "0.75rem",
        padding: "1.25rem 1.5rem",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "1px solid #f3f4f6",
          paddingBottom: "0.75rem",
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Escrow receipt</h3>
          <p style={{ margin: "0.125rem 0 0", fontSize: "0.8125rem", color: "#6b7280" }}>
            Order #{orderId}
          </p>
        </div>
        <span style={{ fontSize: "0.75rem", color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>
          Escrow {escrowId}
        </span>
      </header>

      <EscrowFeeBreakdown
        fees={
          fees ?? {
            grossStroops,
            totalFeeStroops: 0n,
            netProceedsStroops: grossStroops,
            lines: [],
            hasEstimates: true,
          }
        }
      />
    </div>
  );
}
