"use client";

import { useEffect, useMemo, useState } from "react";
import { useDelegations } from "../../hooks/useDelegations";
import { useOrders } from "../../hooks/useOrders";
import {
  DEFAULT_ENTITY_TYPE_FILTERS,
  ENTITY_TYPE_LABELS,
  FilterPanel,
  type EntityTypeFilters,
  type SearchEntityType,
} from "./FilterPanel";

const DEBOUNCE_MS = 300;

interface SearchResultItem {
  id: string;
  type: SearchEntityType;
  title: string;
  subtitle: string;
}

interface SearchResultGroup {
  type: SearchEntityType;
  label: string;
  items: SearchResultItem[];
}

function matchesQuery(
  query: string,
  ...fields: (string | null | undefined)[]
): boolean {
  return fields.some((field) => field?.toLowerCase().includes(query));
}

/**
 * Global search accessible from the app header. Queries across
 * delegations, orders, and transactions (escrowed orders), grouping
 * matches by entity type. Input is debounced to avoid filtering on
 * every keystroke.
 */
export function GlobalSearch() {
  const { delegations } = useDelegations();
  const { orders } = useOrders();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<EntityTypeFilters>(
    DEFAULT_ENTITY_TYPE_FILTERS
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setQuery("");
        setFiltersOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const groups = useMemo<SearchResultGroup[]>(() => {
    if (!debouncedQuery) return [];

    const items: SearchResultItem[] = [];

    if (filters.delegation) {
      for (const delegation of delegations) {
        if (
          matchesQuery(
            debouncedQuery,
            delegation.id,
            delegation.agentId,
            delegation.status
          )
        ) {
          items.push({
            id: delegation.id,
            type: "delegation",
            title: `Delegation ${delegation.id}`,
            subtitle: `Agent ${delegation.agentId} · ${delegation.status}`,
          });
        }
      }
    }

    if (filters.order) {
      for (const order of orders) {
        if (
          matchesQuery(debouncedQuery, order.id, order.merchantId, order.status)
        ) {
          items.push({
            id: order.id,
            type: "order",
            title: `Order ${order.id}`,
            subtitle: `Merchant ${order.merchantId} · ${order.status}`,
          });
        }
      }
    }

    if (filters.transaction) {
      for (const order of orders) {
        if (!order.escrowContractId) continue;
        if (
          matchesQuery(
            debouncedQuery,
            order.escrowContractId,
            order.id,
            order.status
          )
        ) {
          items.push({
            id: order.escrowContractId,
            type: "transaction",
            title: `Transaction ${order.escrowContractId}`,
            subtitle: `Order ${order.id} · ${order.status}`,
          });
        }
      }
    }

    return (Object.keys(ENTITY_TYPE_LABELS) as SearchEntityType[])
      .map((type) => ({
        type,
        label: ENTITY_TYPE_LABELS[type],
        items: items.filter((item) => item.type === type),
      }))
      .filter((group) => group.items.length > 0);
  }, [debouncedQuery, delegations, orders, filters]);

  const showResults = debouncedQuery.length > 0;

  return (
    <div className="global-search">
      <div className="global-search-input-wrap">
        <input
          type="search"
          role="searchbox"
          className="global-search-input"
          placeholder="Search delegations, orders, transactions..."
          aria-label="Search delegations, orders, and transactions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="global-search-filter-toggle"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-label="Toggle search filters"
        >
          Filters
        </button>
      </div>

      {filtersOpen && <FilterPanel filters={filters} onChange={setFilters} />}

      {showResults && (
        <div
          className="global-search-results"
          role="listbox"
          aria-label="Search results"
        >
          {groups.length === 0 ? (
            <p className="global-search-empty">No results found</p>
          ) : (
            groups.map((group) => (
              <div className="global-search-group" key={group.type}>
                <p className="global-search-group-label">{group.label}</p>
                {group.items.map((item) => (
                  <div
                    className="global-search-item"
                    role="option"
                    aria-selected={false}
                    key={`${item.type}-${item.id}`}
                  >
                    <span className="global-search-item-title">
                      {item.title}
                    </span>
                    <span className="global-search-item-subtitle">
                      {item.subtitle}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
