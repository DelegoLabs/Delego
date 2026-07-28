import type { OrderStatus } from "@delego/types";
import { orderStatusLabel } from "../../lib/orders";

export interface OrderStatusBadgeProps {
  status: OrderStatus;
}

/** Coloured pill for an order status, reusing the shared `.order-status-*` styles. */
export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  return (
    <span className={`status-badge order-status-${status}`}>
      {orderStatusLabel(status)}
    </span>
  );
}
