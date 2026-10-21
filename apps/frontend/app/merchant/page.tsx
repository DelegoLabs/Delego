"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@delegolabs/ui";
import { useMerchantCatalog } from "../../hooks/useMerchantCatalog";
import { useMerchantEscrowOrders } from "../../hooks/useMerchantEscrowOrders";
import { useMerchantPayouts } from "../../hooks/useMerchantPayouts";
import { computeDepletedProducts } from "../../lib/inventoryStock";
import { LowStockBannerAlert } from "../../components/merchant/InventoryAlerts";
import { stroopsToDisplay, totalNetEarningsStroops } from "../../lib/merchantPayouts";

export default function MerchantDashboardRootPage() {
  const router = useRouter();
  const { products, loading: catalogLoading, error: catalogError } = useMerchantCatalog(0);
  const { orders, loading: ordersLoading } = useMerchantEscrowOrders();
  const { payouts, loading: payoutsLoading } = useMerchantPayouts();

  const { depletedProductsCount, criticalItemTitles, hasOutOfStock, severity } =
    useMemo(() => computeDepletedProducts(products), [products]);

  const handleQuickRestock = () => {
    router.push("/merchant/catalog?lowStock=1");
  };

  const totalEarnings = useMemo(() => totalNetEarningsStroops(payouts), [payouts]);
  const activeOrdersCount = useMemo(
    () => orders.filter((o) => o.status === "funded" || o.status === "shipped").length,
    [orders]
  );

  return (
    <div
      data-testid="merchant-dashboard-root"
      style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
    >
      {/* Prominent warning banner at the top of merchant dashboard whenever items have 0 or < 5 items remaining */}
      <LowStockBannerAlert
        depletedProductsCount={depletedProductsCount}
        criticalItemTitles={criticalItemTitles}
        onQuickRestockClick={handleQuickRestock}
        hasOutOfStock={hasOutOfStock}
        severity={severity}
      />

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Merchant Dashboard</h1>
          <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
            Overview of catalog inventory, orders, and settlements.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link
            href="/merchant/catalog"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#374151",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Manage Catalog
          </Link>
          <Link
            href="/merchant/orders"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#374151",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            View Orders
          </Link>
          <Link
            href="/merchant/payouts"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#374151",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Payouts
          </Link>
        </div>
      </header>

      {/* Summary metric cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1rem",
        }}
      >
        <Card title="Catalog Products" ariaLabel="Catalog Products Summary">
          <p style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>
            {catalogLoading ? "..." : products.length}
          </p>
          <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: "0.25rem 0 0" }}>
            {depletedProductsCount > 0 ? (
              <span style={{ color: hasOutOfStock ? "#dc2626" : "#d97706", fontWeight: 600 }}>
                {depletedProductsCount} item{depletedProductsCount === 1 ? "" : "s"} low/out of stock
              </span>
            ) : (
              "All stock levels healthy"
            )}
          </p>
        </Card>

        <Card title="Active Escrow Orders" ariaLabel="Active Orders Summary">
          <p style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>
            {ordersLoading ? "..." : activeOrdersCount}
          </p>
          <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: "0.25rem 0 0" }}>
            Awaiting fulfillment or delivery confirmation.
          </p>
        </Card>

        <Card title="Settled Net Earnings" ariaLabel="Net Earnings Summary">
          <p style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>
            {payoutsLoading ? "..." : `${stroopsToDisplay(totalEarnings)} XLM`}
          </p>
          <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: "0.25rem 0 0" }}>
            Net of platform fees across settled payouts.
          </p>
        </Card>
      </div>

      {catalogError && (
        <div role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem" }}>
          {catalogError}
        </div>
      )}
    </div>
  );
}
