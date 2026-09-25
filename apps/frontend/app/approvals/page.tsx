"use client";

import { useCallback, useEffect, useMemo } from "react";
import { Amount, Button, Card } from "@delegolabs/ui";
import type { RejectionReasonCode } from "@delegolabs/types";
import { useOrders } from "../../hooks/useOrders";
import { useAnnounce } from "../../hooks/useAnnounce";
import { useCurrency } from "../../hooks/useCurrency";
import { useNow } from "../../hooks/useNow";
import { useNotifications } from "../../hooks/useNotifications";
import { useApprovalNotifications } from "../../hooks/useApprovalNotifications";
import { useQueryParamState } from "../../hooks/useQueryParamState";
import {
  HIGH_VALUE_THRESHOLD_STROOPS,
  needsApproval,
  sortOrders,
  sumOrderTotals,
} from "../../lib/orders";
import { STALE_DIGEST_THRESHOLD_HOURS, countStaleApprovals } from "../../lib/approvals";
import { ApprovalDrawer } from "../../components/orders/ApprovalDrawer";
import { VirtualApprovalList } from "../../components/orders/VirtualApprovalList";
import { CopyViewLinkButton } from "../../components/filters/CopyViewLinkButton";
import { HelpLink } from "../../components/help/HelpLink";
import { ConflictResolutionCard } from "../../components/offline/ConflictResolutionCard";

const POLL_INTERVAL_MS = 15_000;

/**
 * Approval workflow — review and approve/reject high-value orders.
 *
 * The queue is rendered via VirtualApprovalList (@tanstack/react-virtual)
 * so DOM node count stays bounded even with hundreds of pending approvals.
 * Hotkey navigation (j/k/a/r/Enter) and selection state live inside the
 * virtual list component, operating on logical indices rather than DOM refs
 * so they work correctly across virtual window edges.
 *
 * Cursor-pagination note: VirtualApprovalList is orthogonal to pagination.
 * Append new pages to `queue` as they arrive; the virtualizer gains rows
 * automatically without any changes to this file.
 */
export default function ApprovalsPage() {
  const {
    orders,
    loading,
    error,
    pendingIds,
    pendingOfflineIds,
    conflictMutations,
    approveOrder,
    rejectOrder,
    refresh,
  } = useOrders({ pollIntervalMs: POLL_INTERVAL_MS });

  const { announce } = useAnnounce();
  const { currencyId, rate } = useCurrency();

  const handleApprove = useCallback(
    async (id: string) => {
      const result = await approveOrder(id);
      announce(result ? `Order ${id} approved.` : `Failed to approve order ${id}.`);
      return result;
    },
    [approveOrder, announce]
  );

  const handleReject = useCallback(
    async (id: string, reason?: string, reasonCode?: RejectionReasonCode) => {
      const result = await rejectOrder(id, reason, reasonCode);
      announce(result ? `Order ${id} rejected.` : `Failed to reject order ${id}.`);
      return result;
    },
    [rejectOrder, announce]
  );

  const now = useNow();
  const { add: addNotification } = useNotifications();

  const [oldestFirst, setOldestFirst] = useQueryParamState<boolean>({
    key: "oldestFirst",
    defaultValue: false,
  });

  const [drawerOrderId, setDrawerOrderId] = useQueryParamState<string | null>({
    key: "focus",
    defaultValue: null,
  });

  const queue = useMemo(() => {
    const filtered = orders.filter((order) => needsApproval(order));
    return sortOrders(filtered, "createdAt", oldestFirst ? "asc" : "desc");
  }, [orders, oldestFirst]);

  const pendingValue = useMemo(() => sumOrderTotals(queue), [queue]);

  useApprovalNotifications({ queue, loading });

  // Digest hint: surface a notification-center entry for a stale backlog.
  useEffect(() => {
    if (loading) return;
    const staleCount = countStaleApprovals(queue, now, STALE_DIGEST_THRESHOLD_HOURS);
    if (staleCount === 0) return;
    addNotification({
      id: "approvals-stale-digest",
      type: "warning",
      title: `${staleCount} approval${staleCount === 1 ? "" : "s"} waiting > ${STALE_DIGEST_THRESHOLD_HOURS}h`,
      href: "/approvals",
    });
  }, [queue, now, loading, addNotification]);

  const drawerOrder =
    queue.find((order) => order.id === drawerOrderId) ?? null;

  return (
    <div className="settings-page">
      <header className="header">
        <div className="header-row">
          <div>
            <h1>Approvals</h1>
            <p
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                flexWrap: "wrap",
              }}
            >
              Review high-value orders (over{" "}
              <Amount
                stroops={HIGH_VALUE_THRESHOLD_STROOPS}
                currency={currencyId}
                xlmUsdRate={rate?.xlmUsdRate}
              />
              ) that require your sign-off before they proceed
              <HelpLink concept="approval" />
            </p>
          </div>
          <CopyViewLinkButton />
        </div>
      </header>

      {/* Conflict Resolution Cards for HTTP 409 offline replay conflicts (#618) */}
      {conflictMutations.map((mutation) => (
        <ConflictResolutionCard
          key={mutation.id}
          mutation={mutation}
          onResolved={() => refresh()}
        />
      ))}

      {error && (
        <div className="settings-status error" role="alert">
          {error}
        </div>
      )}

      <div className="grid">
        <Card title="Awaiting review">
          <p className="stat-value stat-neutral">{queue.length}</p>
          <p className="stat-label">High-value orders</p>
        </Card>
        <Card title="Value pending approval">
          <p className="stat-value">
            <Amount
              stroops={pendingValue}
              currency={currencyId}
              xlmUsdRate={rate?.xlmUsdRate}
            />
          </p>
          <p className="stat-label">Across the queue</p>
        </Card>
      </div>

      <div className="form-actions">
        <Button
          variant="ghost"
          onClick={() => setOldestFirst(!oldestFirst)}
          ariaLabel="Toggle sort order"
        >
          Sort: {oldestFirst ? "Oldest first" : "Newest first"}
        </Button>
      </div>

      {loading && orders.length === 0 ? (
        <div className="card skeleton">
          <div className="skeleton-title" />
          <div className="skeleton-text" />
          <div className="skeleton-text" />
          <div className="skeleton-button" />
        </div>
      ) : (
        /*
         * VirtualApprovalList handles the empty state internally.
         * Hotkeys, cheat-sheet, undo snackbar, and selection all live
         * inside the component — this page only owns data fetching + sorting.
         *
         * Pagination note: append new pages to `queue` as they arrive via
         * cursor pagination; the virtualizer gains rows automatically.
         * Virtualization is orthogonal to how pages arrive.
         */
        <VirtualApprovalList
          queue={queue}
          pendingIds={pendingIds}
          pendingOfflineIds={pendingOfflineIds}
          onApprove={handleApprove}
          onReject={handleReject}
          onOpenDrawer={setDrawerOrderId}
          drawerOpen={drawerOrderId !== null}
        />
      )}

      <ApprovalDrawer
        order={drawerOrder}
        pending={drawerOrderId ? pendingIds.has(drawerOrderId) : false}
        onApprove={handleApprove}
        onReject={handleReject}
        onClose={() => setDrawerOrderId(null)}
      />
    </div>
  );
}
