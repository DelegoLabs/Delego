"use client";

import { useState } from "react";
import { Button } from "@delegolabs/ui";

export interface FilterPillsProps {
  filters: import("../../lib/catalogFilters").CatalogFilterState;
  categories: string[];
  onToggleCategory: (cat: string) => void;
  onToggleMaxPrice: (raw: string) => void;
  onToggleMinPrice: (raw: string) => void;
  onToggleMinRating: (raw: string) => void;
  onClearFilters: () => void;
}

function FilterPills({
  filters,
  categories,
  onToggleCategory,
  onToggleMaxPrice,
  onToggleMinPrice,
  onToggleMinRating,
  onClearFilters,
}: FilterPillsProps) {
  const [minPriceInput, setMinPriceInput] = useState(filters.minPrice ?? "");
  const [maxPriceInput, setMaxPriceInput] = useState(filters.maxPrice ?? "");
  const [minRatingValue, setMinRatingValue] = useState(filters.minRating ?? "");

  const hasActive =
    filters.categories.length > 0 ||
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined ||
    filters.minRating !== undefined;

  return (
    <div className="filter-pills-bar" role="region" aria-label="Product filters">
      {/* Categories pill group */}
      {categories.length > 0 && (
        <div className="filter-pill-group">
          {categories.map((cat) => {
            const isSelected = filters.categories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                className={`filter-pill ${isSelected ? "filter-pill--active" : ""}`}
                onClick={() => onToggleCategory(cat)}
                aria-pressed={isSelected}
                disabled={isSelected}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* Min price pill */}
      {filters.minPrice !== undefined && (
        <button
          type="button"
          className="filter-pill filter-pill--active"
          onClick={() => onToggleMinPrice("")}
          aria-label="Clear minimum price filter"
        >
          ${(filters.minPrice / 1000000).toFixed(1)}k
        </button>
      )}

      {/* Max price pill */}
      {filters.maxPrice !== undefined && (
        <button
          type="button"
          className="filter-pill filter-pill--active"
          onClick={() => onToggleMaxPrice("")}
          aria-label="Clear maximum price filter"
        >
          ${(filters.maxPrice / 1000000).toFixed(1)}k
        </button>
      )}

      {/* Min rating pill */}
      {filters.minRating !== undefined && (
        <button
          type="button"
          className="filter-pill filter-pill--active"
          onClick={() => onToggleMinRating("")}
          aria-label="Clear minimum rating filter"
        >
          {filters.minRating}★ and above
        </button>
      )}

      {/* Clear all button */}
      {hasActive && (
        <Button
          variant="ghost"
          size="small"
          onClick={onClearFilters}
          style={{ marginLeft: "0.5rem" }}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}

export { FilterPills };