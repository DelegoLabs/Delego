"use client";

import { Button, Card, ErrorBoundary } from "@delego/ui";
import { DelegationSkeleton } from "../components/DelegationSkeleton";
import { OrderSkeleton } from "../components/OrderSkeleton";
import { useDelegations } from "../hooks/useDelegations";
import { useOrders } from "../hooks/useOrders";
import { WalletConnectButton } from "../components/wallet/WalletConnectButton";

/** Dashboard landing page for the main Delego experience. */
export default function HomePage() {
  const { delegations, loading: delegationsLoading } = useDelegations();
  const { orders, loading: ordersLoading } = useOrders();

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Delego</h1>
        <p>AI commerce with approval and spending controls</p>
      </header>

      <section className="grid">
        <ErrorBoundary componentName="Delegations">
          <Card title="Delegations">
            <p>Grant AI agents scoped shopping authority.</p>
            {delegationsLoading ? (
              <DelegationSkeleton />
            ) : delegations.length > 0 ? (
              <ul className="nav-list">
                {delegations.map((delegation) => (
                  <li key={delegation.id}>
                    {delegation.agentId} — {delegation.status}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="stat-label">No delegations yet.</p>
            )}
            <Button variant="primary">Create Delegation</Button>
          </Card>
        </ErrorBoundary>

        <ErrorBoundary componentName="Orders">
          <Card title="Orders">
            <p>Track purchases initiated by your agents.</p>
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
        </ErrorBoundary>

        <ErrorBoundary componentName="Wallet">
          <Card title="Wallet">
            <p>Connect your Stellar wallet.</p>
            <WalletConnectButton showDetails={false} />
          </Card>
        </ErrorBoundary>
      </section>
    </div>
  );
}
