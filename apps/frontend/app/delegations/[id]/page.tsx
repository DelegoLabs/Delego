"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ActivityTimeline, Amount, Button, Card } from "@delegolabs/ui";
import type { ActivityTimelineEvent } from "@delegolabs/ui";
import { rejectionReasonLabel } from "../../../lib/rejectionReasons";
import { useDelegations } from "../../../hooks/useDelegations";
import { useOrders } from "../../../hooks/useOrders";
import { useEscrows } from "../../../hooks/useEscrows";
import { useCurrency } from "../../../hooks/useCurrency";
import { ExpiryCountdown } from "../../../components/delegations/ExpiryCountdown";
import { LimitUsageBar } from "../../../components/delegations/LimitUsageBar";
import { PauseResumeConfirmModal } from "../../../components/delegations/PauseResumeConfirmModal";
import { OrderTable } from "../../../components/orders/OrderTable";
import { EscrowCard } from "../../../components/escrows/EscrowCard";

export default function DelegationDetailPage() {
  const params = useParams();
  const delegationId = (params?.id as string) ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();

  const { delegations, loading, updateDelegation, revokeDelegation } = useDelegations();
  const { orders } = useOrders();
  const { escrows } = useEscrows();
  const { currencyId, rate } = useCurrency();

  const currentTabParam = searchParams.get("tab") ?? "activity";
  const [activeTab, setActiveTab] = useState<"activity" | "orders" | "escrows">(
    currentTabParam === "orders" || currentTabParam === "escrows" ? currentTabParam : "activity"
  );

  const [showPauseModal, setShowPauseModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  const delegation = delegations.find((d) => d.id === delegationId);

  useEffect(() => {
    if (currentTabParam && (currentTabParam === "activity" || currentTabParam === "orders" || currentTabParam === "escrows")) {
      setActiveTab(currentTabParam);
    }
  }, [currentTabParam]);

  const handleTabChange = (tab: "activity" | "orders" | "escrows") => {
    setActiveTab(tab);
    router.replace(`/delegations/${delegationId}?tab=${tab}`, { scroll: false });
  };

  if (loading) {
    return (
      <div className="settings-page" style={{ padding: "2rem 0" }}>
        <div className="card skeleton" style={{ padding: "2rem" }}>
          <div className="skeleton-title" style={{ width: "40%", height: "2rem", marginBottom: "1rem" }} />
          <div className="skeleton-text" style={{ width: "60%", marginBottom: "0.5rem" }} />
          <div className="skeleton-text" style={{ width: "80%" }} />
        </div>
      </div>
    );
  }

  if (!delegation) {
    return (
      <div className="settings-page" style={{ padding: "2rem 0" }}>
        <Card title="Delegation Not Found" ariaLabel="Delegation Not Found">
          <div style={{ padding: "1rem 0" }}>
            <p style={{ color: "var(--color-text-muted, #6b7280)", marginBottom: "1.5rem" }}>
              No delegation could be found with ID <code style={{ backgroundColor: "#f3f4f6", padding: "0.25rem 0.5rem", borderRadius: "0.25rem" }}>{delegationId}</code>.
            </p>
            <Link href="/delegations" prefetch={true}>
              <Button variant="primary">← Back to Delegations</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const isPaused = delegation.status === "paused";
  const isRevoked = delegation.status === "revoked";
  const isExpired = delegation.status === "expired";
  const isTerminal = isRevoked || isExpired;

  const handleConfirmPauseToggle = async () => {
    setModalLoading(true);
    try {
      const nextStatus = isPaused ? "active" : "paused";
      await updateDelegation(delegation.id, { status: nextStatus });
      setShowPauseModal(false);
    } finally {
      setModalLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (window.confirm(`Revoke delegation "${delegation.agentId}"? This cannot be undone.`)) {
      const ok = await revokeDelegation(delegation.id);
      if (ok) {
        router.push("/delegations");
      }
    }
  };

  // Filter orders and escrows for this delegation
  const delegationOrders = orders.filter((o) => o.delegationId === delegation.id);
  const delegationEscrows = escrows.filter((e) => e.buyerId === delegation.userId);

  // Build delegation timeline activity events
  const activityEvents: ActivityTimelineEvent[] = [
    {
      id: `evt-created-${delegation.id}`,
      type: "delegation_created",
      title: "Delegation Granted",
      description: `Permission ${delegation.permissionLevel ?? "AUTO_APPROVE"} assigned to Agent ${delegation.agentId}`,
      timestamp: new Date(delegation.createdAt),
      tone: "success",
    },
    ...(delegation.updatedAt && new Date(delegation.updatedAt).getTime() !== new Date(delegation.createdAt).getTime()
      ? [
          {
            id: `evt-updated-${delegation.id}`,
            type: "delegation_updated",
            title: `Delegation Status: ${delegation.status.toUpperCase()}`,
            description: `Policy status changed to ${delegation.status}`,
            timestamp: new Date(delegation.updatedAt),
            tone: (isPaused ? "pending" : isTerminal ? "failed" : "success") as ActivityTimelineEvent["tone"],
          },
        ]
      : []),
    ...delegationOrders.map((order) => {
      const rejectionLabel = rejectionReasonLabel(order.rejectionReason);
      const rejectionDetail = [rejectionLabel, order.rejectionNote]
        .filter(Boolean)
        .join(": ");
      return {
        id: `evt-order-${order.id}`,
        type: "order_placed",
        title: `Order #${order.id.slice(-6)} - ${order.merchantName}`,
        description: `Amount: ${order.amount} XLM | Status: ${order.status}${
          rejectionDetail ? ` | Reason: ${rejectionDetail}` : ""
        }`,
        timestamp: new Date(order.createdAt),
        tone: (order.status === "completed" ? "success" : order.status === "failed" ? "failed" : "pending") as ActivityTimelineEvent["tone"],
      };
    }),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return (
    <div className="settings-page" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header Breadcrumb */}
      <div>
        {/* Single, low-cost link — viewport prefetch is fine (#621). */}
        <Link href="/delegations" prefetch={true} style={{ fontSize: "0.875rem", color: "var(--color-primary, #2563eb)", fontWeight: 500 }}>
          ← Back to Delegations
        </Link>
      </div>

      {/* Main Overview Header Card */}
      <Card
        title={delegation.label || `Agent ${delegation.agentId}`}
        ariaLabel={`Delegation detail for ${delegation.agentId}`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Header Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <span className={`status-badge status-${delegation.status}`}>
                  {delegation.status}
                </span>
                {delegation.policy.expiresAt && (
                  <ExpiryCountdown expiresAt={delegation.policy.expiresAt} />
                )}
              </div>
              <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.875rem", color: "var(--color-text-muted, #6b7280)" }}>
                Agent ID: <code style={{ backgroundColor: "#f3f4f6", padding: "0.125rem 0.375rem", borderRadius: "0.25rem" }}>{delegation.agentId}</code>
                {delegation.walletId && (
                  <> • Wallet: <code style={{ backgroundColor: "#f3f4f6", padding: "0.125rem 0.375rem", borderRadius: "0.25rem" }}>{delegation.walletId}</code></>
                )}
              </p>
            </div>

            {/* Action Buttons */}
            {!isTerminal && (
              <div className="form-actions" style={{ display: "flex", gap: "0.5rem" }}>
                <Button variant="secondary" onClick={() => setShowPauseModal(true)}>
                  {isPaused ? "Resume Delegation" : "Pause Delegation"}
                </Button>
                <Button variant="ghost" onClick={handleRevoke}>
                  Revoke
                </Button>
              </div>
            )}
          </div>

          {/* Quick Metrics Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginTop: "0.5rem", paddingTop: "1rem", borderTop: "1px solid var(--color-border, #e5e7eb)" }}>
            <div>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #6b7280)" }}>Max per Transaction</span>
              <div style={{ fontSize: "1.125rem", fontWeight: 600 }}>
                <Amount stroops={delegation.policy.maxPerTransaction} currency={currencyId} xlmUsdRate={rate?.xlmUsdRate} />
              </div>
            </div>
            <div>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #6b7280)" }}>Total Cap Limit</span>
              <div style={{ fontSize: "1.125rem", fontWeight: 600 }}>
                <Amount stroops={delegation.policy.maxTotal} currency={currencyId} xlmUsdRate={rate?.xlmUsdRate} />
              </div>
            </div>
            <div>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #6b7280)" }}>Allowed Merchants</span>
              <div style={{ fontSize: "0.9375rem", fontWeight: 500, color: "var(--color-text-main, #111827)" }}>
                {delegation.policy.allowedMerchants.length > 0 ? delegation.policy.allowedMerchants.join(", ") : "All Merchants"}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Expanded Spending Headroom Bar */}
      <LimitUsageBar
        spent={0n}
        cap={delegation.policy.maxTotal}
        periodRollover={delegation.policy.expiresAt}
        density="expanded"
      />

      {/* Tabbed Drilldown Section */}
      <Card title="Delegation Drilldown" ariaLabel="Delegation Drilldown">
        {/* Tab Header Buttons */}
        <div
          role="tablist"
          aria-label="Delegation drilldown tabs"
          style={{
            display: "flex",
            gap: "0.5rem",
            borderBottom: "1px solid var(--color-border, #e5e7eb)",
            marginBottom: "1.5rem",
            paddingBottom: "0.5rem",
          }}
        >
          <Button
            variant={activeTab === "activity" ? "primary" : "ghost"}
            onClick={() => handleTabChange("activity")}
            role="tab"
            aria-selected={activeTab === "activity"}
          >
            Activity ({activityEvents.length})
          </Button>
          <Button
            variant={activeTab === "orders" ? "primary" : "ghost"}
            onClick={() => handleTabChange("orders")}
            role="tab"
            aria-selected={activeTab === "orders"}
          >
            Orders ({delegationOrders.length})
          </Button>
          <Button
            variant={activeTab === "escrows" ? "primary" : "ghost"}
            onClick={() => handleTabChange("escrows")}
            role="tab"
            aria-selected={activeTab === "escrows"}
          >
            Escrows ({delegationEscrows.length})
          </Button>
        </div>

        {/* Tab Content Panels */}
        {activeTab === "activity" && (
          <div role="tabpanel" aria-label="Activity tab">
            <ActivityTimeline events={activityEvents} emptyMessage="No recent activity recorded for this delegation." />
          </div>
        )}

        {activeTab === "orders" && (
          <div role="tabpanel" aria-label="Orders tab">
            {delegationOrders.length > 0 ? (
              <OrderTable orders={delegationOrders} />
            ) : (
              <p style={{ color: "var(--color-text-muted, #6b7280)", fontSize: "0.875rem" }}>
                No orders placed under this delegation yet.
              </p>
            )}
          </div>
        )}

        {activeTab === "escrows" && (
          <div role="tabpanel" aria-label="Escrows tab">
            {delegationEscrows.length > 0 ? (
              <div style={{ display: "grid", gap: "1rem" }}>
                {delegationEscrows.map((escrow) => (
                  <EscrowCard key={escrow.id} escrow={escrow} />
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--color-text-muted, #6b7280)", fontSize: "0.875rem" }}>
                No active or historical escrows found for this delegation.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Confirmation Modal */}
      <PauseResumeConfirmModal
        isOpen={showPauseModal}
        action={isPaused ? "resume" : "pause"}
        agentId={delegation.agentId}
        onConfirm={handleConfirmPauseToggle}
        onCancel={() => setShowPauseModal(false)}
        loading={modalLoading}
      />
    </div>
  );
}
