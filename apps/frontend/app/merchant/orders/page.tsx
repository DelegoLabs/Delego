"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@delegolabs/ui";
import { useMerchantEscrowOrders } from "../../../hooks/useMerchantEscrowOrders";
import { useNow } from "../../../hooks/useNow";
import { ExpiryCountdown } from "../../../components/delegations/ExpiryCountdown";
import { ShipmentUploadModal } from "../../../components/orders/ShipmentUploadModal";
import { BulkFulfillActionBar } from "../../../components/orders/BulkFulfillActionBar";
import { BulkFulfillModal } from "../../../components/orders/BulkFulfillModal";
import { DeliveryEvidenceUploader } from "../../../components/escrows/DeliveryEvidenceUploader";
import { VirtualTable } from "../../../components/orders/VirtualTable";
import { deadlineUrgency, type MerchantEscrowOrder } from "../../../lib/merchantEscrowOrders";
import {
  isFulfillable,
  runBulkFulfillment,
  withOptimisticShipments,
  type BulkFulfillmentItem,
} from "../../../lib/bulkFulfillment";

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

interface BulkResult {
  succeeded: number;
  failedOrderIds: string[];
}

export default function MerchantOrdersPage() {
  const t = useTranslations("bulkFulfillment");
  const { orders: fetchedOrders, loading, error, refresh } = useMerchantEscrowOrders();
  const now = useNow(1000);
  const [activeTab, setActiveTab] = useState<Tab>("toShip");
  const [shipModalOrderId, setShipModalOrderId] = useState<string | null>(null);
  const [evidenceOrderId, setEvidenceOrderId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  // Orders shown as shipped while their batch submission is in flight (#1014).
  const [optimisticShipped, setOptimisticShipped] = useState<ReadonlySet<string>>(new Set());
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  const orders = useMemo(
    () => withOptimisticShipments(fetchedOrders, optimisticShipped),
    [fetchedOrders, optimisticShipped]
  );
  const activeStatuses = TABS.find((t) => t.key === activeTab)!.statuses;
  const visibleOrders = orders.filter((o) => activeStatuses.includes(o.status));
  const fulfillableIds = visibleOrders.filter(isFulfillable).map((o) => o.orderId);
  const selectedOrderIds = fulfillableIds.filter((id) => selectedIds.has(id));
  const allSelected = fulfillableIds.length > 0 && selectedOrderIds.length === fulfillableIds.length;

  function toggleSelected(orderId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  async function handleBulkSubmit(items: BulkFulfillmentItem[]) {
    const ids = items.map((item) => item.orderId);
    setBulkModalOpen(false);
    setSelectedIds(new Set());
    setBulkResult(null);
    setBulkSubmitting(true);
    setOptimisticShipped((prev) => new Set([...prev, ...ids]));

    const results = await runBulkFulfillment(items);
    const failedOrderIds = results.filter((r) => r.status === "error").map((r) => r.item.orderId);
    // Roll back only the orders whose submission failed.
    setOptimisticShipped((prev) => new Set([...prev].filter((id) => !failedOrderIds.includes(id))));
    setBulkResult({ succeeded: results.length - failedOrderIds.length, failedOrderIds });
    setBulkSubmitting(false);

    if (failedOrderIds.length < results.length) {
      await refresh();
      setOptimisticShipped((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    }
  }

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
              onClick={() => {
                setActiveTab(tab.key);
                setSelectedIds(new Set());
              }}
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

      <div role="status" style={{ fontSize: "0.8125rem" }}>
        {bulkSubmitting && t("submitting")}
        {bulkResult && bulkResult.succeeded > 0 && (
          <span style={{ display: "block", color: "#166534" }}>
            {t("result.success", { count: bulkResult.succeeded })}
          </span>
        )}
        {bulkResult && bulkResult.failedOrderIds.length > 0 && (
          <span style={{ display: "block", color: "#dc2626" }}>
            {t("result.failed", {
              count: bulkResult.failedOrderIds.length,
              orderIds: bulkResult.failedOrderIds.join(", "),
            })}
          </span>
        )}
      </div>

      {activeTab === "toShip" && fulfillableIds.length > 0 && !loading && (
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelectedIds(allSelected ? new Set() : new Set(fulfillableIds))}
          />
          {t("selectAll")}
        </label>
      )}

      {loading ? (
        <p style={{ color: "#6b7280" }}>Loading orders…</p>
      ) : visibleOrders.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No orders in this queue.</p>
      ) : (
        <VirtualTable<MerchantEscrowOrder>
          data={visibleOrders}
          estimateRowHeight={80}
          renderRow={(order) => {
            const urgency = deadlineUrgency(order.deadline, now);
            return (
              <div
                key={order.orderId}
                data-testid={`merchant-order-row-${order.orderId}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.875rem 1rem",
                  borderRadius: "0.75rem",
                  border: "1px solid #e5e7eb",
                  marginBottom: "0.625rem",
                  background: "#fff",
                }}
              >
                {isFulfillable(order) && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(order.orderId)}
                    onChange={() => toggleSelected(order.orderId)}
                    aria-label={t("selectOrder", { orderId: order.orderId })}
                  />
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 }}>
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
                  {(order.status === "shipped" || order.status === "delivered") && (
                    <button
                      type="button"
                      onClick={() => setEvidenceOrderId(order.orderId)}
                      style={{
                        padding: "0.375rem 0.75rem",
                        borderRadius: "0.5rem",
                        border: "1px solid #2563eb",
                        background: "#fff",
                        color: "#2563eb",
                        fontWeight: 600,
                        fontSize: "0.75rem",
                        cursor: "pointer",
                      }}
                    >
                      Add proof
                    </button>
                  )}
                  {order.status !== "funded" && <Badge tone="neutral">{order.status}</Badge>}
                </div>
              </div>
            );
          }}
        />
      )}

      <BulkFulfillActionBar
        selectedCount={selectedOrderIds.length}
        busy={bulkSubmitting}
        onBulkFulfill={() => setBulkModalOpen(true)}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      {/* Mounted only while open so each batch starts with a fresh form. */}
      {bulkModalOpen && (
        <BulkFulfillModal
          open
          orderIds={selectedOrderIds}
          onClose={() => setBulkModalOpen(false)}
          onSubmit={(items) => void handleBulkSubmit(items)}
        />
      )}

      <ShipmentUploadModal
        open={shipModalOrderId != null}
        orderId={shipModalOrderId ?? ""}
        onClose={() => setShipModalOrderId(null)}
        onSubmitted={refresh}
      />

      {evidenceOrderId ? (
        <DeliveryEvidenceUploader
          orderId={evidenceOrderId}
          open
          onClose={() => setEvidenceOrderId(null)}
          onConfirmed={() => {
            setEvidenceOrderId(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
