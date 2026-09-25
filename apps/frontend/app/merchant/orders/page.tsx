"use client";

import { useState } from "react";
import { Badge } from "@delegolabs/ui";
import { useMerchantEscrowOrders } from "../../../hooks/useMerchantEscrowOrders";
import { useNow } from "../../../hooks/useNow";
import { ExpiryCountdown } from "../../../components/delegations/ExpiryCountdown";
import { ShipmentUploadModal } from "../../../components/orders/ShipmentUploadModal";
import { deadlineUrgency, type MerchantEscrowOrder } from "../../../lib/merchantEscrowOrders";

type Tab = "toShip" | "shipped" | "settled";

const TABS: { key: Tab; label: string; statuses: MerchantEscrowOrder["status"][] }[] = [
  { key: "toShip", label: "To Ship", statuses: ["funded"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped"] },
  { key: "settled", label: "Settled", statuses: ["delivered", "released"] },
];

const URGENCY_TONE: Record<ReturnType<typeof deadlineUrgency>, "neutral" | "warning" | "error"> = {
  normal: "neutral",
  amber: "warning",
  red: "error",
};

function formatAmount(order: MerchantEscrowOrder): string {
  const value = Number(BigInt(order.amountStroops)) / 10_000_000;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${order.currency}`;
}

export default function MerchantOrdersPage() {
  const { orders, loading, error, refresh } = useMerchantEscrowOrders();
  const now = useNow(1000);
  const [activeTab, setActiveTab] = useState<Tab>("toShip");
  const [shipModalOrderId, setShipModalOrderId] = useState<string | null>(null);

  const activeStatuses = TABS.find((t) => t.key === activeTab)!.statuses;
  const visibleOrders = orders.filter((o) => activeStatuses.includes(o.status));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h1>Orders</h1>

      <div role="tablist" style={{ display: "flex", gap: "0.5rem" }}>
        {TABS.map((tab) => {
          const count = orders.filter((o) => tab.statuses.includes(o.status)).length;
          return (
            <button
              key={tab.key}
              role="tab"
              type="button"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                border: activeTab === tab.key ? "2px solid #2563eb" : "1px solid #d1d5db",
                background: activeTab === tab.key ? "#eff6ff" : "#fff",
                fontWeight: 600,
                fontSize: "0.8125rem",
                cursor: "pointer",
              }}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      {error && (
        <div role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#6b7280" }}>Loading orders…</p>
      ) : visibleOrders.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No orders in this queue.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {visibleOrders.map((order) => {
            const urgency = deadlineUrgency(order.deadline, now);
            return (
              <div
                key={order.orderId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.875rem 1rem",
                  borderRadius: "0.75rem",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                    Order {order.orderId.slice(0, 8)} — {formatAmount(order)}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                    Buyer {order.buyerAddress.slice(0, 4)}…{order.buyerAddress.slice(-4)} ·{" "}
                    {order.shippingAddress}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  {order.status === "funded" && (
                    <Badge tone={URGENCY_TONE[urgency]}>
                      <ExpiryCountdown expiresAt={order.deadline} />
                    </Badge>
                  )}
                  {order.status === "funded" && (
                    <button
                      type="button"
                      onClick={() => setShipModalOrderId(order.orderId)}
                      style={{
                        padding: "0.375rem 0.75rem",
                        borderRadius: "0.5rem",
                        border: "none",
                        background: "#2563eb",
                        color: "#fff",
                        fontWeight: 600,
                        fontSize: "0.75rem",
                        cursor: "pointer",
                      }}
                    >
                      Mark shipped
                    </button>
                  )}
                  {order.status !== "funded" && <Badge tone="neutral">{order.status}</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ShipmentUploadModal
        open={shipModalOrderId != null}
        orderId={shipModalOrderId ?? ""}
        onClose={() => setShipModalOrderId(null)}
        onSubmitted={refresh}
      />
    </div>
  );
}
