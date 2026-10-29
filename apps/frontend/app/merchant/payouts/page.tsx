"client";

import { Card } from "@delegolabs/ui";
import { LowStockBanner } from "../../../components/merchant/InventoryAlerts";
import { RevenueAreaChart } from "../../../components/merchant/RevenueAreaChart";
import { AssetRevenueCards } from "../../../components/merchant/AssetRevenueCards";
import { useMerchantCatalog } from "../../../hooks/useMerchantCatalog";
import { useMerchantPayouts } from "../../../hooks/useMerchantPayouts";
import { useMerchantEscrowOrders } from "../../../hooks/useMerchantEscrowOrders";
import { useNetwork } from "../../../hooks/useNetwork";
import { PayoutHistoryTable } from "../../../components/PayoutHistoryTable";
import { stroopsToDisplay, totalNetEarningsStroops, computeAssetRevenueBreakdowns } from "../../../lib/merchantPayouts";
import { computePayoutProjections } from "../../../lib/merchantEscrowOrders";

export default function MerchantPayoutsPage() {
  const { payouts, loading, error } = useMerchantPayouts();
  const { products } = useMerchantCatalog(0);
  const { orders } = useMerchantEscrowOrders();
  const { network } = useNetwork();
  
  const totalNet = totalNetEarningsStroops(payouts);
  const projections = computePayoutProjections(orders);
  const assetBreakdowns = computeAssetRevenueBreakdowns(payouts, orders);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h1>Payouts</h1>

      <LowStockBanner products={products} />

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

      <div style={{ marginTop: "0.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>Revenue Breakdown by Settlement Token</h2>
        <AssetRevenueCards breakdowns={assetBreakdowns} payouts={payouts} networkId={network.id} />
      </div>

      <RevenueAreaChart payouts={payouts} />

      {error && (
        <div role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem" }}>
          {error}
        </div>
      )}

      {loading && (
        <p style={{ color: "#6b7280" }}>Loading payout history…</p>
      )}
    </div>
  );
}
