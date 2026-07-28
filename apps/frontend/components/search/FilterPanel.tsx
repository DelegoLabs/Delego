"use client";

/** Entity types that GlobalSearch can query across. */
export type SearchEntityType = "delegation" | "order" | "transaction";

/** Which entity types should be included in search results. */
export type EntityTypeFilters = Record<SearchEntityType, boolean>;

export const DEFAULT_ENTITY_TYPE_FILTERS: EntityTypeFilters = {
  delegation: true,
  order: true,
  transaction: true,
};

export const ENTITY_TYPE_LABELS: Record<SearchEntityType, string> = {
  delegation: "Delegations",
  order: "Orders",
  transaction: "Transactions",
};

export interface FilterPanelProps {
  filters: EntityTypeFilters;
  onChange: (filters: EntityTypeFilters) => void;
}

/**
 * Toggle panel for narrowing GlobalSearch results down to specific
 * entity types (delegations, orders, transactions).
 */
export function FilterPanel({ filters, onChange }: FilterPanelProps) {
  const entityTypes = Object.keys(ENTITY_TYPE_LABELS) as SearchEntityType[];

  const toggle = (type: SearchEntityType) => {
    onChange({ ...filters, [type]: !filters[type] });
  };

  return (
    <div
      className="filter-panel"
      role="group"
      aria-label="Filter search results by entity type"
    >
      {entityTypes.map((type) => (
        <label key={type} className="filter-panel-option">
          <input
            type="checkbox"
            checked={filters[type]}
            onChange={() => toggle(type)}
          />
          {ENTITY_TYPE_LABELS[type]}
        </label>
      ))}
    </div>
  );
}
