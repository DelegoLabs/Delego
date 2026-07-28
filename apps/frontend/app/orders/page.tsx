"use client";

import { useMemo, useState } from "react";
import type { OrderStatus } from "@delego/types";
import { useOrders } from "../../hooks/useOrders";
import {
  filterOrders,
  paginate,
  sortOrders,
  type OrderSortField,
  type SortDirection,
} from "../../lib/orders";
import { OrderFilters } from "../../components/orders/OrderFilters";
import { OrderTable } from "../../components/orders/OrderTable";
import { Pagination } from "../../components/orders/Pagination";

const PAGE_SIZE = 10;

/** Transaction history — filterable, sortable, paginated view of all orders. */
export default function OrdersPage() {
  const { orders, loading, error } = useOrders();

  const [search, setSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<OrderStatus[]>([]);
  const [sortField, setSortField] = useState<OrderSortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  // Recompute the derived view whenever the data, filters, or sort change.
  // Resetting to page 1 on filter change is handled by the change callbacks.
  const visible = useMemo(() => {
    const filtered = filterOrders(orders, {
      search,
      statuses: selectedStatuses,
    });
    const sorted = sortOrders(filtered, sortField, sortDirection);
    return paginate(sorted, page, PAGE_SIZE);
  }, [orders, search, selectedStatuses, sortField, sortDirection, page]);

  const toggleStatus = (status: OrderStatus) => {
    setPage(1);
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  };

  const handleSearch = (value: string) => {
    setPage(1);
    setSearch(value);
  };

  const handleSort = (field: OrderSortField, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
  };

  const handleReset = () => {
    setSearch("");
    setSelectedStatuses([]);
    setPage(1);
  };

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Transaction History</h1>
        <p>Browse, search, and filter every order across your delegations</p>
      </header>

      {error && (
        <div className="settings-status error" role="alert">
          {error}
        </div>
      )}

      <OrderFilters
        search={search}
        onSearchChange={handleSearch}
        selectedStatuses={selectedStatuses}
        onToggleStatus={toggleStatus}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={handleSort}
        onReset={handleReset}
      />

      {loading && orders.length === 0 ? (
        <div className="card skeleton">
          <div className="skeleton-title" />
          <div className="skeleton-text" />
          <div className="skeleton-text" />
          <div className="skeleton-text" />
        </div>
      ) : visible.totalItems === 0 ? (
        <div className="card">
          <p>
            {orders.length === 0
              ? "No orders yet. Orders placed by your agents will appear here."
              : "No orders match the current filters."}
          </p>
        </div>
      ) : (
        <>
          <OrderTable orders={visible.items} />
          <Pagination
            page={visible.page}
            totalPages={visible.totalPages}
            totalItems={visible.totalItems}
            pageSize={visible.pageSize}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
