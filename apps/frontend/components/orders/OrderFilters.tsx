"use client";

import type { OrderStatus } from "@delego/types";
import { Button } from "@delego/ui";
import { orderStatusLabel } from "../../lib/orders";
import type { OrderSortField, SortDirection } from "../../lib/orders";

const ALL_STATUSES: OrderStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "escrowed",
  "fulfilled",
  "settled",
  "cancelled",
  "disputed",
];

export interface OrderFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  selectedStatuses: OrderStatus[];
  onToggleStatus: (status: OrderStatus) => void;
  sortField: OrderSortField;
  sortDirection: SortDirection;
  onSortChange: (field: OrderSortField, direction: SortDirection) => void;
  onReset: () => void;
}

/** Search box, status chips, and sort control for the transaction history page. */
export function OrderFilters({
  search,
  onSearchChange,
  selectedStatuses,
  onToggleStatus,
  sortField,
  sortDirection,
  onSortChange,
  onReset,
}: OrderFiltersProps) {
  const sortValue = `${sortField}:${sortDirection}`;
  const hasActiveFilters = search.trim() !== "" || selectedStatuses.length > 0;

  return (
    <div className="order-filters">
      <div className="order-filters-row">
        <input
          type="search"
          className="order-search"
          placeholder="Search by order, merchant, or delegation ID"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search orders"
        />
        <label className="order-sort">
          <span className="order-sort-label">Sort</span>
          <select
            value={sortValue}
            onChange={(e) => {
              const [field, direction] = e.target.value.split(":") as [
                OrderSortField,
                SortDirection,
              ];
              onSortChange(field, direction);
            }}
            aria-label="Sort orders"
          >
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="totalStroops:desc">Highest amount</option>
            <option value="totalStroops:asc">Lowest amount</option>
            <option value="updatedAt:desc">Recently updated</option>
          </select>
        </label>
      </div>

      <fieldset className="order-status-filter">
        <legend className="order-status-filter-legend">Filter by status</legend>
        <div className="order-status-chips">
          {ALL_STATUSES.map((status) => {
            const active = selectedStatuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                className={`order-chip${active ? " order-chip--active" : ""}`}
                aria-pressed={active}
                onClick={() => onToggleStatus(status)}
              >
                {orderStatusLabel(status)}
              </button>
            );
          })}
        </div>
      </fieldset>

      {hasActiveFilters && (
        <div className="form-actions">
          <Button variant="ghost" onClick={onReset}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
