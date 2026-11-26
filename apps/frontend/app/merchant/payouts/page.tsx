"client";

import { useState } from "";
import { Card } from "@delegolabs/ui";
import { LowStockBanner } from "../../../components/merchant/InventoryAlerts";
import { RevenueAreaChart } from "../../../components/merchant/RevenueAreaChart";
import { AssetRevenueCards } from "../../../components/merchant/AssetRevenueCards";
import { useMerchantCatalog } from "../../../hooks/useMerchantCatalog";
import { useMerchantPayouts } from "../../../hooks/useMerchantPayouts";
import { useMerchantEscrowOrders } from "../../../hooks/useMerchantEscrowOrders";
import { useNetwork } from "../../../hooks/useNetwork";
import { PayoutHistoryTable } from "../../../components/PayoutHistoryTable";
import { stroopsToDisplay, totalNetEarningsStroops, computeAssetRevenueBreakdowns, normalizeAssetCode } from "../../../lib/merchantPayouts";
import { computePayoutProjections } from "../../../lib/merchantEscrowOrders";

export default function MerchantPayoutsPage() {
  const { payouts, loading, error } = useMerchantPayouts();
  const { products } = useMerchantCatalog(0);
  const { orders } = useMerchantEscrowOrders();
  const { network } = useNetwork();
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  
  const totalNet = totalNetEarningsStroops(payouts);
  const projections = computePayoutProjections(orders);
  const assetBreakdowns = computeAssetRevenueBreakdowns(payouts, []);

  const filteredPayouts = selectedAsset
    ? payouts.filter((p) => normalizeAssetCode(p.assetCode ?? p.currency) === selectedAsset)
    : payouts;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h1>Payouts</h1>

      <LowStockBanner products={products} />

      <AssetRevenueCards
        breakdowns={assetBreakdowns}
        selectedAsset={selectedAsset}
        onSelectAsset={setSelectedAsset}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <Card title="Total earnings" ariaLabel="Total net earnings">
          <p style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            {stroopsToDisplay(totalNet)} XLM
          </p>
          <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: 0 }}>
            Net of fees, across {payouts.length} settled payout{payouts.length === 1 ? "" : "s"}.
          </p>
        </Card>

        <Card title="Projected net payouts" ariaLabel="Projected net payouts from active orders">
          <p style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }} title="Estimated net after platform fees">
            {stroopsToDisplay(projections.projectedNetPayout)} XLM
          </p>
          <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: 0 }}>
            <span title="Pending gross amount locked in active escrows">
              Gross: {stroopsToDisplay(projections.pendingGrossStroops)} XLM
            </span>
            {" · "}
            <span title="Estimated 1% platform fee withheld at release">
              Fees: {stroopsToDisplay(projections.estimatedPlatformFees)} XLM
            </span>
          </p>
        </Card>
      </div>

      <RevenueAreaChart payouts={filteredPayouts} />

      {error && (
        <div role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#6b7280" }}>Loading payout history…</p>
      ) : (
        <div>
          {selectedAsset && (
            <p style={{ fontSize: "0.8125rem", color: "#4b5563", margin: "0 0 0.5rem 0" }}>
              Showing ledger history filtered for <strong>{selectedAsset}</strong>.
            </p>
          )}
          <PayoutHistoryTable payouts={filteredPayouts} networkId={network.id} />
        </div>
      )}
    </div>
  );
}
