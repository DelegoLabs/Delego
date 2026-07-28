"use client";

import type { Order } from "@delego/types";
import { formatXlm } from "../../lib/orders";
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
                <span className="order-id" title={order.id}>
                  {order.id}
                </span>
              </td>
              <td>{order.merchantId}</td>
              <td>
                <OrderStatusBadge status={order.status} />
              </td>
              <td>{itemCount(order)}</td>
              <td className="order-amount">{formatXlm(order.totalStroops)} XLM</td>
              <td>{formatDate(order.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
