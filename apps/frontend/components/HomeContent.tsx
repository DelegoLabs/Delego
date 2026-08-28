"use client";

import { Button, Card } from "@delegolabs/ui";
import { DelegationSkeleton } from "./DelegationSkeleton";
import { ExpiryCountdown } from "./delegations/public";
import { OrderSkeleton } from "./OrderSkeleton";
import { WalletConnectButton } from "./wallet/public";
import { useDelegations } from "../hooks/useDelegations";
import { useOrders } from "../hooks/useOrders";
import { StaleBadge } from "./offline/StaleBadge";

export function HomeContent() {
  const {
    delegations,
    loading: delegationsLoading,
    stale: delegationsStale,
    cachedAt: delegationsCachedAt,
    ttlMs: delegationsTtl,
  } = useDelegations();
  const {
    orders,
    loading: ordersLoading,
    stale: ordersStale,
    cachedAt: ordersCachedAt,
    ttlMs: ordersTtl,
  } = useOrders();

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Delego</h1>
        <p>AI commerce with approval and spending controls</p>
      </header>

      <section className="grid">
        <Card title="Delegations">
          <p>Grant AI agents scoped shopping authority.</p>
          <StaleBadge
            family="delegations"
            stale={delegationsStale}
            cachedAt={delegationsCachedAt}
            ttlMs={delegationsTtl}
          />
          {delegationsLoading ? (
            <DelegationSkeleton />
          ) : delegations.length > 0 ? (
            <ul className="nav-list">
              {delegations.map((delegation) => (
                <li key={delegation.id}>
                  {delegation.agentId} — {delegation.status}{" "}
                  <ExpiryCountdown expiresAt={delegation.policy.expiresAt} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="stat-label">No delegations yet.</p>
          )}
          <Button variant="primary">Create Delegation</Button>
        </Card>

        <Card title="Orders">
          <p>Track purchases initiated by your agents.</p>
          <StaleBadge
            family="orders"
            stale={ordersStale}
            cachedAt={ordersCachedAt}
            ttlMs={ordersTtl}
          />
          {ordersLoading ? (
            <OrderSkeleton />
          ) : orders.length > 0 ? (
            <ul className="nav-list">
              {orders.map((order) => (
                <li key={order.id}>
                  {order.merchantId} — {order.status}
                </li>
              ))}
            </ul>
          ) : (
            <p className="stat-label">No orders yet.</p>
          )}
        </Card>

        <Card title="Wallet">
          <p>Connect your Stellar wallet.</p>
          <WalletConnectButton showDetails={false} />
        </Card>
      </section>
    </div>
  );
}
