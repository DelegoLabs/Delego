"client";

import React, { useState } from "react";
import { Card } from "@delegolabs/ui";
import { AssetRevenueBreakdown } from "@delegolabs/types";
import { stroopsToDisplay, PayoutRecord } from "../../lib/merchantPayouts";
import { PayoutHistoryTable } from "../PayoutHistoryTable";

interface AssetRevenueCardsProps {
  breakdowns: AssetRevenueBreakdown[];
  payouts: PayoutRecord[];
  networkId?: string;
}

const assetLogos: Record<string, string> = {
  USDC: "https://assets.coingecko.com/coins/images/6319/standard/usdc.png",
  EURC: "https://assets.coingecko.com/coins/images/26045/standard/euroc.png",
  XLM: "https://assets.coingecko.com/coins/images/100/standard/stellar_symbol_black_on_white.png",
};

export function AssetRevenueCards({ breakdowns, payouts, networkId = "testnet" }: AssetRevenueCardsProps) {
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  const filteredPayouts = selectedAsset
    ? payouts.filter(p => (p.assetCode || p.currency || "XLM").toUpperCase() === selectedAsset)
    : payouts;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        {breakdowns.map((b) => {
          const isSelected = selectedAsset === b.assetCode;
          const logoUrl = assetLogos[b.assetCode] || assetLogos.XLM;

          return (
            <div
              key={b.assetCode}
              onClick={() => setSelectedAsset(isSelected ? null : b.assetCode)}
              style={{ cursor: "pointer" }}
            >
              <Card
                title={
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <img
                      src={logoUrl}
                      alt={`${b.assetCode} logo`}
                      style={{ width: "24px", height: "24px", borderRadius: "50%", objectFit: "contain" }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                    <span>{b.assetCode} Revenue Breakdown</span>
                  </div>
                }
                ariaLabel={`${b.assetCode} revenue breakdown`}
                style={isSelected ? { border: "2px solid #2563eb", boxShadow: "0 4px 12px rgba(37, 99, 235, 0.15)" } : {}}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div>
                    <p style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
                      {stroopsToDisplay(b.settledVolumeStroops)} {b.symbol}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: 0 }}>
                      Settled Net Earnings (~${b.fiatEquivalentUsd.toLocaleString()} USD)
                    </p>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", marginTop: "0.25rem", paddingTop: "0.5rem", borderTop: "1px solid #e5e7eb" }}>
                    <span title="Pending escrow locked" style={{ color: "#d97706" }}>
                      Pending: <strong>{stroopsToDisplay(b.pendingEscrowVolumeStroops)}</strong>
                    </span>
                    <span title="Refunded volume" style={{ color: "#dc2626" }}>
                      Refunded: <strong>{stroopsToDisplay(b.refundedVolumeStroops)}</strong>
                    </span>
                  </div>

                  <div style={{ fontSize: "0.7rem", color: "#2563eb", textAlign: "right", marginTop: "0.25rem" }}>
                    {isSelected ? "Showing ledger history (Click to reset)" : "Click to view ledger history →"}
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      {selectedAsset && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: "0.75rem 1rem", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
            Filtering ledger history for asset: <span style={{ color: "#2563eb" }}>{selectedAsset}</span>
          </span>
          <button
            onClick={() => setSelectedAsset(null)}
            style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "0.8125rem", textDecoration: "underline" }}
          >
            Clear filter
          </button>
        </div>
      )}

      <PayoutHistoryTable payouts={filteredPayouts} networkId={networkId} />
    </div>
  );
}
