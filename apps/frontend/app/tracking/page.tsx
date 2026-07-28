"use client";

import { useMemo, useState } from "react";
import { Button } from "@delego/ui";
import { useOrders } from "../../hooks/useOrders";
import { isTerminal } from "../../lib/orders";
import { OrderTrackingCard } from "../../components/orders/OrderTrackingCard";

/** How often to re-fetch orders for near-real-time status updates. */
const POLL_INTERVAL_MS = 15_000;

function formatUpdated(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Order tracking dashboard with live-polling status timelines. */
export default function TrackingPage() {
  const { orders, loading, error, lastUpdated, refresh } = useOrders({
    pollIntervalMs: POLL_INTERVAL_MS,
  });
  const [showCompleted, setShowCompleted] = useState(false);

  const { active, completed } = useMemo(() => {
    const active = orders.filter((order) => !isTerminal(order));
    const completed = orders.filter((order) => isTerminal(order));
    return { active, completed };
  }, [orders]);

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Order Tracking</h1>
        <p>Follow in-flight orders as their status updates in real time</p>
      </header>

      <div className="tracking-toolbar">
        <span className="tracking-live" aria-live="polite">
          <span className="tracking-live-dot" aria-hidden="true" />
          Live · updated {formatUpdated(lastUpdated)}
        </span>
        <Button variant="secondary" onClick={() => refresh()} ariaLabel="Refresh now">
          Refresh
        </Button>
      </div>

      {error && (
        <div className="settings-status error" role="alert">
          {error}
        </div>
      )}

      {loading && orders.length === 0 ? (
        <section className="grid">
          <div className="card skeleton">
            <div className="skeleton-title" />
            <div className="skeleton-text" />
            <div className="skeleton-text" />
          </div>
          <div className="card skeleton">
            <div className="skeleton-title" />
            <div className="skeleton-text" />
            <div className="skeleton-text" />
          </div>
        </section>
      ) : active.length === 0 ? (
        <div className="card">
          <p>No orders are currently in flight.</p>
        </div>
      ) : (
        <div className="grid">
          {active.map((order) => (
            <OrderTrackingCard key={order.id} order={order} />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <section className="tracking-completed">
          <div className="form-actions">
            <Button
              variant="ghost"
              onClick={() => setShowCompleted((v) => !v)}
              aria-expanded={showCompleted}
            >
              {showCompleted ? "Hide" : "Show"} completed ({completed.length})
            </Button>
          </div>
          {showCompleted && (
            <div className="grid">
              {completed.map((order) => (
                <OrderTrackingCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
