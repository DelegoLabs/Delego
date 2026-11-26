"client";

import React from "";
import { Card } from "@delegolabs/ui";
import { AssetRevenueBreakdown } from "@delegolabs/types";
import { stroopsToDisplay } from "../../lib/merchantPayouts";

interface AssetRevenueCardsProps {
  breakdowns: AssetRevenueBreakdown[];
  selectedAsset: string | null;
  onSelectAsset: (assetCode: string | null) => void;
}

export function AssetRevenueCards({
  breakdowns,
  selectedAsset,
  onSelectAsset,
}: AssetRevenueCardsProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 650 }}>
          Revenue by Settlement Asset
        </h3>
        {selectedAsset && (
          <button
            onClick={() => onSelectAsset(null)}
            style={{
              background: "transparent",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              cursor: "pointer",
            }}
          >
            Show All Assets
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
        {breakdowns.map((b) => {
          const isSelected = selectedAsset === b.assetCode;
          return (
            <div
              key={b.assetCode}
              onClick={() => onSelectAsset(isSelected ? null : b.assetCode)}
              style={{
                cursor: "pointer",
                borderRadius: "0.5rem",
                border: isSelected ? "2px solid #6366f1" : "1px solid #e5e7eb",
                transition: "all 0.2s ease",
              }}
            >
              <Card title={`${b.symbol} Revenue Breakdown`} ariaLabel={`${b.symbol} revenue summary`}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                      {stroopsToDisplay(b.settledVolumeStroops)} {b.symbol}
                    </span>
                    <span style={{ fontSize: "0.8125rem", color: "#4b5563" }}>
                      ~${b.fiatEquivalentUsd.toLocaleString()} USD
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.75rem", color: "#6b7280" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Pending Escrow:</span>
                      <span style={{ fontWeight: 600, color: "#d97706" }}>
                        {stroopsToDisplay(b.pendingEscrowVolumeStroops)} {b.symbol}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Refunded:</span>
                      <span>{stroopsToDisplay(b.refundedVolumeStroops)} {b.symbol}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
