"use client";

import { ActivityTimeline, Amount, Card } from "@delegolabs/ui";
import type { Order } from "@delegolabs/types";
import { isTerminal, orderToTimelineEvents } from "../../lib/orders";
import { useCurrency } from "../../hooks/useCurrency";

export interface OrderTrackingCardProps {
  order: Order;
}

function formatTime(date: Date | string | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Live-tracking card: lifecycle timeline plus the latest known order details. */
export function OrderTrackingCard({ order }: OrderTrackingCardProps) {
  const settled = isTerminal(order);
  const { currencyId, rate } = useCurrency();

  return (
    <Card
      title={`Order ${order.id}`}
      ariaLabel={`Tracking for order ${order.id}`}
    >
      <ActivityTimeline
        events={orderToTimelineEvents(order)}
        ariaLabel="Order progress"
      />

      <dl className="wallet-detail-list">
        <div className="wallet-detail-row">
          <dt>Merchant</dt>
          <dd>{order.merchantId}</dd>
        </div>
        <div className="wallet-detail-row">
          <dt>Total</dt>
          <dd>
            <Amount
              stroops={order.totalStroops}
              currency={currencyId}
              xlmUsdRate={rate?.xlmUsdRate}
            />
          </dd>
        </div>
        <div className="wallet-detail-row">
          <dt>Escrow</dt>
          <dd>{order.escrowContractId ?? "Not yet escrowed"}</dd>
        </div>
        <div className="wallet-detail-row">
          <dt>{settled ? "Completed" : "Last update"}</dt>
          <dd>{formatTime(order.updatedAt)}</dd>
        </div>
      </dl>
    </Card>
  );
}
