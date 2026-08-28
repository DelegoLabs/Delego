"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Amount, Button, Card } from "@delegolabs/ui";
import type { RejectionReasonCode } from "@delegolabs/types";
import { useOrders } from "../../hooks/useOrders";
import { useAnnounce } from "../../hooks/useAnnounce";
import { useCurrency } from "../../hooks/useCurrency";
import { useNow } from "../../hooks/useNow";
import { useNotifications } from "../../hooks/useNotifications";
import { useApprovalHotkeys } from "../../hooks/useApprovalHotkeys";
import { useApprovalNotifications } from "../../hooks/useApprovalNotifications";
import { useQueryParamState } from "../../hooks/useQueryParamState";
import { HIGH_VALUE_THRESHOLD_STROOPS, needsApproval, sortOrders, sumOrderTotals } from "../../lib/orders";
import { STALE_DIGEST_THRESHOLD_HOURS, countStaleApprovals } from "../../lib/approvals";
import { ApprovalCard } from "../../components/orders/ApprovalCard";
import { ApprovalDrawer } from "../../components/orders/ApprovalDrawer";
import { HotkeyCheatSheet } from "../../components/orders/HotkeyCheatSheet";
import { UndoSnackbar } from "../../components/orders/UndoSnackbar";
import { CopyViewLinkButton } from "../../components/filters/CopyViewLinkButton";
import { HelpLink } from "../../components/help/HelpLink";

import { ConflictResolutionCard } from "../../components/offline/ConflictResolutionCard";

const POLL_INTERVAL_MS = 15_000;

/** Approval workflow — review and approve/reject high-value orders. */
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
  } = useOrders({
    pollIntervalMs: POLL_INTERVAL_MS,
  });
  const { announce } = useAnnounce();
  const { currencyId, rate } = useCurrency();

  const handleApprove = useCallback(
    async (id: string) => {
      const result = await approveOrder(id);
      announce(
        result ? `Order ${id} approved.` : `Failed to approve order ${id}.`
      );
      return result;
    },
    [approveOrder, announce]
  );

  const handleReject = useCallback(
    async (id: string, reason?: string, reasonCode?: RejectionReasonCode) => {
      const result = await rejectOrder(id, reason, reasonCode);
      announce(
        result ? `Order ${id} rejected.` : `Failed to reject order ${id}.`
      );
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
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const queue = useMemo(() => {
    const filtered = orders.filter((order) => needsApproval(order));
    return sortOrders(filtered, "createdAt", oldestFirst ? "asc" : "desc");
  }, [orders, oldestFirst]);
  const pendingValue = useMemo(() => sumOrderTotals(queue), [queue]);
  const itemIds = useMemo(() => queue.map((order) => order.id), [queue]);

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

  const { focusedId, setFocusedId, showCheatSheet, setShowCheatSheet, undoAction, dismissUndo } =
    useApprovalHotkeys({
      itemIds,
      onApprove: handleApprove,
      onReject: handleReject,
      onOpenDrawer: setDrawerOrderId,
      disabled: drawerOrderId !== null,
    });

  // The roving focus ring follows keyboard navigation, not just mouse/tab focus.
  useEffect(() => {
    if (focusedId) rowRefs.current.get(focusedId)?.focus();
  }, [focusedId]);

  // Deep link from a background-tab notification: /approvals?focus=<orderId>.
  // `drawerOrderId` is itself sourced from the `focus` query param above, so
  // this only needs to mirror it into the roving-focus hotkey state.
  useEffect(() => {
    if (drawerOrderId) setFocusedId(drawerOrderId);
  }, [drawerOrderId, setFocusedId]);

  const drawerOrder = queue.find((order) => order.id === drawerOrderId) ?? null;

  return (
    <div className="settings-page">
      <header className="header">
        <div className="header-row">
          <div>
            <h1>Approvals</h1>
            <p style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap" }}>
              Review high-value orders (over{" "}
              <Amount stroops={HIGH_VALUE_THRESHOLD_STROOPS} currency={currencyId} xlmUsdRate={rate?.xlmUsdRate} />)
              that require your sign-off before they proceed
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
            <Amount stroops={pendingValue} currency={currencyId} xlmUsdRate={rate?.xlmUsdRate} />
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
        <Button
          variant="ghost"
          onClick={() => setShowCheatSheet(true)}
          ariaLabel="Show keyboard shortcuts"
        >
          Keyboard shortcuts (?)
        </Button>
      </div>

      {loading && orders.length === 0 ? (
        <div className="card skeleton">
          <div className="skeleton-title" />
          <div className="skeleton-text" />
          <div className="skeleton-text" />
          <div className="skeleton-button" />
        </div>
      ) : queue.length === 0 ? (
        <div className="card">
          <p>All caught up — no high-value orders are awaiting approval.</p>
        </div>
      ) : (
        <div className="grid">
          {queue.map((order) => (
            <div
              key={order.id}
              ref={(el) => {
                if (el) rowRefs.current.set(order.id, el);
                else rowRefs.current.delete(order.id);
              }}
              tabIndex={-1}
              className={`approval-row${order.id === focusedId ? " is-focused" : ""}`}
              onFocus={() => setFocusedId(order.id)}
            >
              <ApprovalCard
                order={order}
                pending={pendingIds.has(order.id)}
                pendingOffline={pendingOfflineIds.has(order.id)}
                onApprove={handleApprove}
                onReject={handleReject}
              />

            </div>
          ))}
        </div>
      )}

      <ApprovalDrawer
        order={drawerOrder}
        pending={drawerOrderId ? pendingIds.has(drawerOrderId) : false}
        onApprove={handleApprove}
        onReject={handleReject}
        onClose={() => setDrawerOrderId(null)}
      />
      {/*
        `explainability` is intentionally omitted here: the orders payload
        doesn't carry agent-reasoning data yet (orchestrator events #130/#206
        aren't surfaced to the frontend). ApprovalDrawer already collapses
        every optional section cleanly, so it just renders without them until
        the payload is extended — see lib/approvalExplainability.ts.
      */}

      {showCheatSheet && <HotkeyCheatSheet onClose={() => setShowCheatSheet(false)} />}

      <UndoSnackbar action={undoAction} onDismiss={dismissUndo} />
    </div>
  );
}
