"use client";

import { useMemo } from "react";
import { Card } from "@delego/ui";
import { useOrders } from "../../hooks/useOrders";
import {
  HIGH_VALUE_THRESHOLD_STROOPS,
  formatXlm,
  needsApproval,
  sumOrderTotals,
} from "../../lib/orders";
import { ApprovalCard } from "../../components/orders/ApprovalCard";

/** Approval workflow — review and approve/reject high-value orders. */
export default function ApprovalsPage() {
  const { orders, loading, error, pendingIds, approveOrder, rejectOrder } =
    useOrders();

  const queue = useMemo(
    () => orders.filter((order) => needsApproval(order)),
    [orders]
  );
  const pendingValue = useMemo(() => sumOrderTotals(queue), [queue]);

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Approvals</h1>
        <p>
          Review high-value orders (over {formatXlm(HIGH_VALUE_THRESHOLD_STROOPS)}{" "}
          XLM) that require your sign-off before they proceed
        </p>
      </header>

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
          <p className="stat-value">{formatXlm(pendingValue)} XLM</p>
          <p className="stat-label">Across the queue</p>
        </Card>
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
            <ApprovalCard
              key={order.id}
              order={order}
              pending={pendingIds.has(order.id)}
              onApprove={approveOrder}
              onReject={rejectOrder}
            />
          ))}
        </div>
      )}
    </div>
  );
}
