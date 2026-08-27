"use client";

import Link from "next/link";
import type { Order } from "@delegolabs/types";
import { Amount } from "@delegolabs/ui";
import { useCurrency } from "../../hooks/useCurrency";
import { OrderStatusBadge } from "./OrderStatusBadge";

export interface OrderTableProps {
  orders: Order[];
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function itemCount(order: Order): number {
  return order.lineItems.reduce((sum, item) => sum + item.quantity, 0);
}

/** Read-only table of orders. Empty/loading states are handled by the caller. */
export function OrderTable({ orders }: OrderTableProps) {
  const { currencyId, rate } = useCurrency();

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
                <Link href={`/orders/${order.id}`} className="order-id" title={`View receipt for ${order.id}`}>
                  {order.id}
                </Link>
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
              <td>{formatDate(order.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
