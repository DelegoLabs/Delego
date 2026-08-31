"use client";

import { useLocale } from "next-intl";
import type { Order } from "@delegolabs/types";
import { Amount } from "@delegolabs/ui";
import { useCurrency } from "../../hooks/useCurrency";
import { useTimeFormat } from "../../hooks/useTimeFormat";
import { formatDateTimeWithPreferences } from "../../lib/intl";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { HoverPrefetchLink } from "../layout/HoverPrefetchLink";

export interface OrderTableProps {
  orders: Order[];
}

function itemCount(order: Order): number {
  return order.lineItems.reduce((sum, item) => sum + item.quantity, 0);
}

/** Read-only table of orders. Empty/loading states are handled by the caller. */
export function OrderTable({ orders }: OrderTableProps) {
  const { currencyId, rate } = useCurrency();
  const locale = useLocale();
  const { preferences: timeFormatPreferences } = useTimeFormat();

  return (
    <div className="comparison-table-wrapper">
      <table className="comparison-table order-table">
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Merchant</th>
            <th scope="col">Status</th>
            <th scope="col">Items</th>
            <th scope="col">Total</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                {/* Table row link, potentially many per page — prefetch on
                    hover/intent only, not viewport, to avoid a prefetch
                    storm as the table scrolls into view (#621). */}
                <HoverPrefetchLink href={`/orders/${order.id}`} className="order-id" title={`View receipt for ${order.id}`}>
                  {order.id}
                </HoverPrefetchLink>
              </td>
              <td>{order.merchantId}</td>
              <td>
                <OrderStatusBadge status={order.status} />
              </td>
              <td>{itemCount(order)}</td>
              <td className="order-amount">
                <Amount
                  stroops={order.totalStroops}
                  currency={currencyId}
                  xlmUsdRate={rate?.xlmUsdRate}
                />
              </td>
              <td>
                {formatDateTimeWithPreferences(
                  order.createdAt,
                  locale,
                  timeFormatPreferences,
                  { year: "numeric", month: "short", day: "numeric" }
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
