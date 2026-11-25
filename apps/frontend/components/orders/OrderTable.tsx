"use client";

import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import type { Order } from "@delegolabs/types";
import { Amount } from "@delegolabs/ui";
import { useCurrency } from "../../hooks/useCurrency";
import { useTimeFormat } from "../../hooks/useTimeFormat";
import { formatDateTimeWithPreferences } from "../../lib/intl";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { HoverPrefetchLink } from "../layout/HoverPrefetchLink";
import { DownloadInvoiceButton } from "./DownloadInvoiceButton";

export interface OrderTableProps {
  orders: Order[];
}

type OrderTableSortField = "status" | "totalStroops" | "createdAt";
type SortDirection = "asc" | "desc";

const INTERACTIVE_SELECTOR = "a, button, input, select, textarea";

function itemCount(order: Order): number {
  return (order.lineItems ?? []).reduce((sum, item) => sum + item.quantity, 0);
}

function getAriaSort(
  activeField: OrderTableSortField | null,
  field: OrderTableSortField,
  direction: SortDirection
): "ascending" | "descending" | "none" {
  if (activeField !== field) return "none";
  return direction === "asc" ? "ascending" : "descending";
}

function compareOrders(
  a: Order,
  b: Order,
  field: OrderTableSortField,
  direction: SortDirection
): number {
  let delta = 0;
  if (field === "status") {
    delta = a.status.localeCompare(b.status);
  } else if (field === "totalStroops") {
    const aStroops = BigInt(a.totalStroops ?? 0);
    const bStroops = BigInt(b.totalStroops ?? 0);
    delta = aStroops < bStroops ? -1 : aStroops > bStroops ? 1 : 0;
  } else {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    delta = aTime - bTime;
  }
  return direction === "asc" ? delta : -delta;
}

/** Interactive table of orders with sortable headers and keyboard row navigation. */
export function OrderTable({ orders }: OrderTableProps) {
  const router = useRouter();
  const { currencyId, rate } = useCurrency();
  const locale = useLocale();
  const { preferences: timeFormatPreferences } = useTimeFormat();
  const [sortField, setSortField] = useState<OrderTableSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedOrders = useMemo(() => {
    if (!sortField) return orders;
    return [...orders].sort((a, b) =>
      compareOrders(a, b, sortField, sortDirection)
    );
  }, [orders, sortField, sortDirection]);

  const handleSort = (field: OrderTableSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "status" ? "asc" : "desc");
    }
  };

  const handleRowClick = (
    event: MouseEvent<HTMLTableRowElement>,
    orderId: string
  ) => {
    if ((event.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return;
    router.push(`/orders/${orderId}`);
  };

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    orderId: string
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (
      event.target !== event.currentTarget &&
      (event.target as HTMLElement).closest(INTERACTIVE_SELECTOR)
    ) {
      return;
    }
    event.preventDefault();
    router.push(`/orders/${orderId}`);
  };

  const renderSortIndicator = (field: OrderTableSortField) => {
    if (sortField !== field) return null;
    return (
      <span aria-hidden="true" className="sort-icon">
        {sortDirection === "asc" ? " ▲" : " ▼"}
      </span>
    );
  };

  return (
    <div className="comparison-table-wrapper">
      <table className="comparison-table order-table">
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Merchant</th>
            <th
              scope="col"
              aria-sort={getAriaSort(sortField, "status", sortDirection)}
            >
              <button
                type="button"
                className="sort-button"
                onClick={() => handleSort("status")}
              >
                Status{renderSortIndicator("status")}
              </button>
            </th>
            <th scope="col">Items</th>
            <th
              scope="col"
              aria-sort={getAriaSort(sortField, "totalStroops", sortDirection)}
            >
              <button
                type="button"
                className="sort-button"
                onClick={() => handleSort("totalStroops")}
              >
                Total{renderSortIndicator("totalStroops")}
              </button>
            </th>
            <th
              scope="col"
              aria-sort={getAriaSort(sortField, "createdAt", sortDirection)}
            >
              <button
                type="button"
                className="sort-button"
                onClick={() => handleSort("createdAt")}
              >
                Created{renderSortIndicator("createdAt")}
              </button>
            </th>
            <th scope="col">Invoice</th>
          </tr>
        </thead>
        <tbody>
          {sortedOrders.map((order) => (
            <tr
              key={order.id}
              tabIndex={0}
              className="clickable-row"
              onClick={(event) => handleRowClick(event, order.id)}
              onKeyDown={(event) => handleRowKeyDown(event, order.id)}
            >
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
                  new Date(order.createdAt),
                  locale,
                  timeFormatPreferences,
                  { year: "numeric", month: "short", day: "numeric" }
                )}
              </td>
              <td>
                <DownloadInvoiceButton
                  order={order}
                  variant="ghost"
                  label="PDF"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
