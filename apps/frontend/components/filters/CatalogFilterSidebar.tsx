"use client";

import { useEffect, useRef } from "react";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  DEFAULT_CATALOG_FILTERS,
  hasActiveFilters,
  type CatalogFilterState,
} from "../../lib/catalogFilters";

// ---------------------------------------------------------------------------
// Sidebar / drawer shared controls
// ---------------------------------------------------------------------------

interface FilterControlsProps {
  filters: CatalogFilterState;
  categories: string[];
  onChange: (patch: Partial<CatalogFilterState>) => void;
  onReset: () => void;
}

function FilterControls({
  filters,
  categories,
  onChange,
  onReset,
}: FilterControlsProps) {
  const active = hasActiveFilters(filters);

  const toggleCategory = (cat: string) => {
    const next = filters.categories.includes(cat)
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat];
    onChange({ categories: next });
  };

  const handleMinPrice = (raw: string) => {
    const n = raw === "" ? undefined : Number(raw);
    onChange({ minPrice: n !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined });
  };

  const handleMaxPrice = (raw: string) => {
    const n = raw === "" ? undefined : Number(raw);
    onChange({ maxPrice: n !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined });
  };

  const handleMinRating = (raw: string) => {
    const n = raw === "" ? undefined : Number(raw);
    onChange({
      minRating:
        n !== undefined && Number.isFinite(n) && n >= 0 && n <= 5 ? n : undefined,
    });
  };

  return (
    <>
      {/* Category */}
      {categories.length > 0 && (
        <fieldset className="catalog-filter-section">
          <legend className="catalog-filter-section-title">Category</legend>
          {categories.map((cat) => (
            <label key={cat} className="catalog-filter-checkbox">
              <input
                type="checkbox"
                checked={filters.categories.includes(cat)}
                onChange={() => toggleCategory(cat)}
                aria-label={`Filter by ${cat}`}
              />
              {cat}
            </label>
          ))}
        </fieldset>
      )}

      {/* Price range */}
      <div className="catalog-filter-section">
        <p className="catalog-filter-section-title">Price range</p>
        <div className="catalog-filter-price-row">
          <input
            type="number"
            className="catalog-filter-price-input"
            min={0}
            placeholder="Min"
            value={filters.minPrice ?? ""}
            onChange={(e) => handleMinPrice(e.target.value)}
            aria-label="Minimum price in stroops"
          />
          <span>–</span>
          <input
            type="number"
            className="catalog-filter-price-input"
            min={0}
            placeholder="Max"
            value={filters.maxPrice ?? ""}
            onChange={(e) => handleMaxPrice(e.target.value)}
            aria-label="Maximum price in stroops"
          />
        </div>
      </div>

      {/* Minimum rating */}
      <div className="catalog-filter-section">
        <p className="catalog-filter-section-title">Minimum rating</p>
        <div className="catalog-filter-rating-row">
          <label htmlFor="catalog-min-rating" className="catalog-filter-checkbox">
            <span style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
              {filters.minRating !== undefined
                ? `${filters.minRating}★ and above`
                : "Any rating"}
            </span>
          </label>
          <select
            id="catalog-min-rating"
            className="catalog-filter-rating-select"
            value={filters.minRating ?? ""}
            onChange={(e) => handleMinRating(e.target.value)}
            aria-label="Filter by minimum rating"
          >
            <option value="">Any rating</option>
            <option value="1">1★ and above</option>
            <option value="2">2★ and above</option>
            <option value="3">3★ and above</option>
            <option value="4">4★ and above</option>
            <option value="5">5★ only</option>
          </select>
        </div>
      </div>

      {/* In stock */}
      <div className="catalog-filter-section">
        <p className="catalog-filter-section-title">Availability</p>
        <label className="catalog-filter-checkbox">
          <input
            type="checkbox"
            checked={filters.inStockOnly}
            onChange={(e) => onChange({ inStockOnly: e.target.checked })}
            aria-label="Show in-stock products only"
          />
          In stock only
        </label>
      </div>

      {/* Clear */}
      {active && (
        <div style={{ paddingTop: "0.5rem" }}>
          <Button variant="ghost" onClick={onReset} style={{ width: "100%" }}>
            Clear filters
          </Button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Desktop sidebar
// ---------------------------------------------------------------------------

export interface CatalogFilterSidebarProps {
  filters: CatalogFilterState;
  categories: string[];
  onChange: (patch: Partial<CatalogFilterState>) => void;
  onReset: () => void;
}

/**
 * Desktop filter sidebar rendered beside the catalog grid.
 * On mobile (<= 768 px) this element is hidden via CSS; the MobileFilterDrawer
 * is shown instead (both live in the same page so filters stay in sync).
 */
export function CatalogFilterSidebar({
  filters,
  categories,
  onChange,
  onReset,
}: CatalogFilterSidebarProps) {
  return (
    <aside
      className="catalog-filter-sidebar"
      aria-label="Filter products"
    >
      <FilterControls
        filters={filters}
        categories={categories}
        onChange={onChange}
        onReset={onReset}
      />
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Mobile drawer
// ---------------------------------------------------------------------------

export interface MobileCatalogFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: CatalogFilterState;
  categories: string[];
  onChange: (patch: Partial<CatalogFilterState>) => void;
  onReset: () => void;
}

/**
 * Off-canvas filter drawer for mobile.  Uses the same `useFocusTrap` and
 * Escape-key / body-scroll-lock pattern as `MobileNav` (layout/MobileNav.tsx).
 */
export function MobileCatalogFilterDrawer({
  open,
  onClose,
  filters,
  categories,
  onChange,
  onReset,
}: MobileCatalogFilterDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap({ containerRef: panelRef, isActive: open });

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`catalog-filter-overlay${open ? " open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        className={`catalog-filter-drawer${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Filter products"
        aria-hidden={!open}
        tabIndex={-1}
      >
        <div className="catalog-filter-drawer-header">
          <h2 className="catalog-filter-drawer-title">Filters</h2>
          <button
            type="button"
            className="catalog-filter-drawer-close"
            onClick={onClose}
            aria-label="Close filter drawer"
            tabIndex={open ? 0 : -1}
          >
            ×
          </button>
        </div>

        <FilterControls
          filters={filters}
          categories={categories}
          onChange={onChange}
          onReset={onReset}
        />
      </div>
    </>
  );
}
