"use client";

import { useMemo } from "react";
import type { OrderStatus } from "@delegolabs/types";
import { useOrders } from "../../hooks/useOrders";
import { useQueryParamState } from "../../hooks/useQueryParamState";
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
import { CopyViewLinkButton } from "../../components/filters/CopyViewLinkButton";
import { StaleBadge } from "../../components/offline/StaleBadge";

const PAGE_SIZE = 10;

/** Transaction history — filterable, sortable, paginated view of all orders. */
export default function OrdersPage() {
  const { orders, loading, error, stale, cachedAt, ttlMs } = useOrders();

  const [search, setSearch] = useQueryParamState<string>({
    key: "q",
    defaultValue: "",
  });
  const [selectedStatuses, setSelectedStatuses] = useQueryParamState<OrderStatus[]>({
    key: "status",
    defaultValue: [],
  });
  const [sortField, setSortFieldRaw] = useQueryParamState<OrderSortField>({
    key: "sortField",
    defaultValue: "createdAt",
  });
  const [sortDirection, setSortDirectionRaw] = useQueryParamState<SortDirection>({
    key: "sortDir",
    defaultValue: "desc",
  });
  const [page, setPage] = useQueryParamState<number>({
    key: "page",
    defaultValue: 1,
  });

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
    setSelectedStatuses(
      selectedStatuses.includes(status)
        ? selectedStatuses.filter((s) => s !== status)
        : [...selectedStatuses, status]
    );
  };

  const handleSearch = (value: string) => {
    setPage(1);
    setSearch(value);
  };

  const handleSort = (field: OrderSortField, direction: SortDirection) => {
    setSortFieldRaw(field);
    setSortDirectionRaw(direction);
  };

  const handleReset = () => {
    setSearch("");
    setSelectedStatuses([]);
    setPage(1);
  };

  return (
    <div className="settings-page">
      <header className="header">
        <div className="header-row">
          <div>
            <h1>Transaction History</h1>
            <p>Browse, search, and filter every order across your delegations</p>
            <StaleBadge
              family="orders"
              stale={stale}
              cachedAt={cachedAt}
              ttlMs={ttlMs}
            />
          </div>
          <CopyViewLinkButton />
        </div>
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
