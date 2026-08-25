"use client";

import { Card } from "@delego/ui";
import type { Order } from "@delego/types";
import { formatXlm, isTerminal } from "../../lib/orders";
import { StatusTimeline } from "./StatusTimeline";
import { RefundRequestPanel } from "./RefundRequestPanel";

export interface OrderTrackingCardProps {
  order: Order;
}

function formatTime(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Live-tracking card: lifecycle timeline plus the latest known order details. */
export function OrderTrackingCard({ order }: OrderTrackingCardProps) {
  const settled = isTerminal(order);

  return (
    <Card
      title={`Order ${order.id}`}
      ariaLabel={`Tracking for order ${order.id}`}
    >
      <StatusTimeline status={order.status} />

      <dl className="wallet-detail-list">
        <div className="wallet-detail-row">
          <dt>Merchant</dt>
          <dd>{order.merchantId}</dd>
        </div>
        <div className="wallet-detail-row">
          <dt>Total</dt>
          <dd>{formatXlm(order.totalStroops)} XLM</dd>
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

      <RefundRequestPanel order={order} />
    </Card>
  );
}
