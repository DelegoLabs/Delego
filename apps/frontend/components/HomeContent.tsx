"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card } from "@delegolabs/ui";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { DelegationSkeleton } from "./DelegationSkeleton";
import { ExpiryCountdown } from "./delegations/public";
import { OrderSkeleton } from "./OrderSkeleton";
import { WalletConnectButton } from "./wallet/public";
import { useDelegations } from "../hooks/useDelegations";
import { useOrders } from "../hooks/useOrders";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { SubscriptionCard } from "./dashboard/SubscriptionCard";
import { StaleBadge } from "./offline/StaleBadge";

/** Typed confirmation token; kept out of the catalog so translations can't change it. */
const REVOKE_CONFIRMATION_WORD = "REVOKE";

export interface KillSwitchModalProps {
  activeDelegationCount: number;
  onConfirmRevokeAll(): Promise<void>;
}

function KillSwitchModal({
  activeDelegationCount,
  onConfirmRevokeAll,
  onClose,
}: KillSwitchModalProps & { onClose(): void }) {
  const tModal = useTranslations("home.killSwitch");
  const tCommon = useTranslations("common");
  const [confirmation, setConfirmation] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmationInputRef = useRef<HTMLInputElement>(null);

  const confirmed = confirmation === REVOKE_CONFIRMATION_WORD;

  useFocusTrap({
    containerRef: modalRef,
    isActive: true,
    initialFocusRef: confirmationInputRef,
    onEscape: () => {
      if (!revoking) onClose();
    },
  });

  useEffect(() => {
    if (revoking) {
      // All controls are disabled during revocation. Keep focus on the dialog
      // instead of leaving it on a disabled button (or the document body).
      modalRef.current?.focus();
    } else if (error) {
      // The input is enabled again and describes the error, ready for retry.
      confirmationInputRef.current?.focus();
    }
  }, [revoking, error]);

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
      setError(err instanceof Error ? err.message : tModal("errorFallback"));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div
      ref={modalRef}
      className="kill-switch-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kill-switch-modal-title"
      tabIndex={-1}
    >
      <h2 id="kill-switch-modal-title">{tModal("title")}</h2>
      <p>
        {tModal.rich("description", {
          count: activeDelegationCount,
        })}
      </p>
      <label htmlFor="kill-switch-confirmation">
        {tModal.rich("confirmLabel", {
          word: REVOKE_CONFIRMATION_WORD,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </label>
      <input
        ref={confirmationInputRef}
        id="kill-switch-confirmation"
        type="text"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        disabled={revoking}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "kill-switch-error" : undefined}
      />
      {error ? (
        <p id="kill-switch-error" className="stat-label" role="alert">
          {error}
        </p>
      ) : null}
      <div className="kill-switch-actions">
        <Button variant="secondary" onClick={onClose} disabled={revoking}>
          {tCommon("cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirm}
          disabled={!confirmed || revoking}
        >
          {revoking ? tModal("revoking") : tModal("confirm")}
        </Button>
      </div>
    </div>
  );
}

export function HomeContent() {
  const t = useTranslations("home");
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
  const {
    subscriptions,
    loading: subscriptionsLoading,
    error: subscriptionsError,
    pendingIds: subscriptionPendingIds,
    runAction: runSubscriptionAction,
  } = useSubscriptions();

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
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </header>

      <section className="emergency-banner" role="alert">
        <div>
          <strong>{t("killSwitch.bannerTitle")}</strong>
          <p className="stat-label">{t("killSwitch.bannerDescription")}</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setKillSwitchOpen(true)}
          disabled={activeDelegationCount === 0}
        >
          {t("killSwitch.open")}
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
        <Card title={t("delegations.title")} titleLevel={2}>
          <p>{t("delegations.description")}</p>
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
            <p className="stat-label">{t("delegations.empty")}</p>
          )}
          <Button variant="primary">{t("delegations.create")}</Button>
        </Card>

        <Card title={t("orders.title")} titleLevel={2}>
          <p>{t("orders.description")}</p>
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
            <p className="stat-label">{t("orders.empty")}</p>
          )}
        </Card>

        <SubscriptionCard
          subscriptions={subscriptions}
          loading={subscriptionsLoading}
          error={subscriptionsError}
          pendingIds={subscriptionPendingIds}
          onAction={runSubscriptionAction}
        />

        <Card title={t("wallet.title")} titleLevel={2}>
          <p>{t("wallet.description")}</p>
          <WalletConnectButton showDetails={false} />
        </Card>
      </section>
    </div>
  );
}
