"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@delegolabs/ui";
import { useOrders } from "../../hooks/useOrders";
import { isTerminal } from "../../lib/orders";
import { OrderTrackingCard } from "../../components/orders/OrderTrackingCard";

/** How often to re-fetch orders for near-real-time status updates. */
const POLL_INTERVAL_MS = 15_000;

function formatUpdated(date: Date | null, locale: string): string {
  if (!date) return "—";
  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Collect every unique carrier name appearing across all packages in the
 * given order list, returned in sorted order. Orders without packages are
 * represented by the synthetic "No carrier" label so they still appear when
 * no carrier filter is active.
 */
function collectCarriers(orders: ReturnType<typeof useOrders>["orders"]): string[] {
  const carriers = new Set<string>();
  for (const order of orders) {
    if (order.packages && order.packages.length > 0) {
      for (const pkg of order.packages) {
        if (pkg.carrierName) carriers.add(pkg.carrierName);
      }
    }
  }
  return [...carriers].sort();
}

/** Order tracking dashboard with live-polling status timelines. */
export default function TrackingPage() {
  const locale = useLocale();
  const [paused, setPaused] = useState(false);
  const [selectedCarriers, setSelectedCarriers] = useState<Set<string>>(
    new Set()
  );
  const { orders, loading, error, lastUpdated, refresh } = useOrders({
    // Pass undefined when paused so the hook clears the interval.
    pollIntervalMs: paused ? undefined : POLL_INTERVAL_MS,
  });

  const [showCompleted, setShowCompleted] = useState(false);

  const carriers = useMemo(() => collectCarriers(orders), [orders]);

  /** Toggle a carrier in/out of the active filter set. */
  function toggleCarrier(carrier: string) {
    setSelectedCarriers((prev) => {
      const next = new Set(prev);
      if (next.has(carrier)) {
        next.delete(carrier);
      } else {
        next.add(carrier);
      }
      return next;
    });
  }

  /**
   * Whether an order passes the current carrier filter.
   * When no carriers are selected the filter is inactive and every order passes.
   */
  function matchesCarrierFilter(
    order: ReturnType<typeof useOrders>["orders"][number]
  ): boolean {
    if (selectedCarriers.size === 0) return true;
    if (!order.packages || order.packages.length === 0) return false;
    return order.packages.some(
      (pkg) => pkg.carrierName && selectedCarriers.has(pkg.carrierName)
    );
  }

  const { active, completed } = useMemo(() => {
    const active = orders
      .filter((order) => !isTerminal(order))
      .filter(matchesCarrierFilter);
    const completed = orders
      .filter((order) => isTerminal(order))
      .filter(matchesCarrierFilter);
    return { active, completed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, selectedCarriers]);

  return (
    <div className="settings-page">
      <header className="header">
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </header>

      <div className="tracking-toolbar">
        {paused ? (
          <span
            className="tracking-live tracking-live--paused"
            aria-live="polite"
          >
            <span className="tracking-live-dot" aria-hidden="true" />
            Paused · last updated {formatUpdated(lastUpdated, locale)}
          </span>
        ) : (
          <span className="tracking-live" aria-live="polite">
            <span className="tracking-live-dot" aria-hidden="true" />
            Live · updated {formatUpdated(lastUpdated, locale)}
          </span>
        )}

        <div className="tracking-toolbar-actions">
          <Button
            variant="secondary"
            onClick={() => setPaused((v) => !v)}
            aria-pressed={paused}
            ariaLabel={paused ? "Resume live updates" : "Pause live updates"}
          >
            {paused ? "Resume live updates" : "Pause live updates"}
          </Button>

          <Button
            variant="secondary"
            onClick={() => refresh()}
            ariaLabel="Refresh now"
          >
            Refresh
          </Button>
        </div>
      </div>

      {carriers.length > 0 && (
        <div
          className="tracking-carrier-filters"
          role="group"
          aria-label="Filter by carrier"
        >
          {carriers.map((carrier) => {
            const active = selectedCarriers.has(carrier);
            return (
              <button
                key={carrier}
                type="button"
                role="checkbox"
                aria-checked={active}
                onClick={() => toggleCarrier(carrier)}
                className={`tracking-carrier-chip${active ? " tracking-carrier-chip--active" : ""}`}
                data-testid={`carrier-chip-${carrier}`}
              >
                {carrier}
              </button>
            );
          })}
          {selectedCarriers.size > 0 && (
            <button
              type="button"
              className="tracking-carrier-chip-clear"
              onClick={() => setSelectedCarriers(new Set())}
              aria-label="Clear carrier filter"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

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
          <p>
            {selectedCarriers.size > 0
              ? "No in-flight orders match the selected carrier."
              : "No orders are currently in flight."}
          </p>
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
              {showCompleted
                ? t("hideCompleted", { count: completed.length })
                : t("showCompleted", { count: completed.length })}
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
