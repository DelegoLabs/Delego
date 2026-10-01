"use client";

import { useState } from "react";
import { Button, Card } from "@delegolabs/ui";
import { DelegationSkeleton } from "./DelegationSkeleton";
import { ExpiryCountdown } from "./delegations/public";
import { OrderSkeleton } from "./OrderSkeleton";
import { WalletConnectButton } from "./wallet/public";
import { useDelegations } from "../hooks/useDelegations";
import { useOrders } from "../hooks/useOrders";
import { StaleBadge } from "./offline/StaleBadge";

export interface KillSwitchModalProps {
  activeDelegationCount: number;
  onConfirmRevokeAll(): Promise<void>;
}

function KillSwitchModal({
  activeDelegationCount,
  onConfirmRevokeAll,
  onClose,
}: KillSwitchModalProps & { onClose(): void }) {
  const [confirmation, setConfirmation] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = confirmation === "REVOKE";

  async function handleConfirm() {
    if (!confirmed || revoking) {
      return;
    }
    setRevoking(true);
    setError(null);
    try {
      await onConfirmRevokeAll();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to revoke delegations."
      );
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="kill-switch-modal" role="dialog" aria-modal="true">
      <h2>Revoke all delegations</h2>
      <p>
        This will immediately revoke all {activeDelegationCount} active AI agent
        spending permission{activeDelegationCount === 1 ? "" : "s"} on-chain.
        This action cannot be undone.
      </p>
      <label htmlFor="kill-switch-confirmation">
        Type <strong>REVOKE</strong> to confirm
      </label>
      <input
        id="kill-switch-confirmation"
        type="text"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        disabled={revoking}
        autoComplete="off"
      />
      {error ? <p className="stat-label">{error}</p> : null}
      <div className="kill-switch-actions">
        <Button variant="secondary" onClick={onClose} disabled={revoking}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirm}
          disabled={!confirmed || revoking}
        >
          {revoking ? "Revoking…" : "Revoke all"}
        </Button>
      </div>
    </div>
  );
}

export function HomeContent() {
  const {
    delegations,
    revokeDelegation,
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

  const [killSwitchOpen, setKillSwitchOpen] = useState(false);

  const activeDelegationCount = delegations.filter(
    (delegation) => delegation.status === "active"
  ).length;

  async function handleConfirmRevokeAll() {
    await Promise.all(
      delegations
        .filter((delegation) => delegation.status === "active")
        .map((delegation) => revokeDelegation(delegation.id))
    );
  }

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Delego</h1>
        <p>AI commerce with approval and spending controls</p>
      </header>

      <section className="emergency-banner" role="alert">
        <div>
          <strong>Emergency kill-switch</strong>
          <p className="stat-label">
            Instantly revoke all active AI agent spending permissions.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setKillSwitchOpen(true)}
          disabled={activeDelegationCount === 0}
        >
          Revoke all delegations
        </Button>
      </section>

      {killSwitchOpen ? (
        <KillSwitchModal
          activeDelegationCount={activeDelegationCount}
          onConfirmRevokeAll={handleConfirmRevokeAll}
          onClose={() => setKillSwitchOpen(false)}
        />
      ) : null}

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
