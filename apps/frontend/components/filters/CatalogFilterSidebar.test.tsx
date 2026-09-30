import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  CatalogFilterSidebar,
  MobileCatalogFilterDrawer,
} from "./CatalogFilterSidebar";
import { DEFAULT_CATALOG_FILTERS, type CatalogFilterState } from "../../lib/catalogFilters";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultFilters(): CatalogFilterState {
  return { ...DEFAULT_CATALOG_FILTERS };
}

// ---------------------------------------------------------------------------
// CatalogFilterSidebar (desktop)
// ---------------------------------------------------------------------------

describe("CatalogFilterSidebar", () => {
  it("renders category checkboxes for each available category", () => {
    const onChange = vi.fn();
    render(
      <CatalogFilterSidebar
        filters={defaultFilters()}
        categories={["Electronics", "Clothing"]}
        onChange={onChange}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByRole("checkbox", { name: /Electronics/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Clothing/i })).toBeInTheDocument();
  });

  it("does not render category section when no categories are provided", () => {
    render(
      <CatalogFilterSidebar
        filters={defaultFilters()}
        categories={[]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    // No category checkboxes
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("calls onChange with toggled category when a category checkbox is clicked", () => {
    const onChange = vi.fn();
    render(
      <CatalogFilterSidebar
        filters={defaultFilters()}
        categories={["Electronics"]}
        onChange={onChange}
        onReset={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Electronics/i }));
    expect(onChange).toHaveBeenCalledWith({ categories: ["Electronics"] });
  });

  it("deselects a category that is already selected", () => {
    const onChange = vi.fn();
    render(
      <CatalogFilterSidebar
        filters={{ ...defaultFilters(), categories: ["Electronics"] }}
        categories={["Electronics", "Clothing"]}
        onChange={onChange}
        onReset={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Electronics/i }));
    expect(onChange).toHaveBeenCalledWith({ categories: [] });
  });

  it("calls onChange when minPrice input changes", () => {
    const onChange = vi.fn();
    render(
      <CatalogFilterSidebar
        filters={defaultFilters()}
        categories={[]}
        onChange={onChange}
        onReset={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/minimum price/i), { target: { value: "100" } });
    expect(onChange).toHaveBeenCalledWith({ minPrice: 100 });
  });

  it("calls onChange with undefined minPrice when input is cleared", () => {
    const onChange = vi.fn();
    render(
      <CatalogFilterSidebar
        filters={{ ...defaultFilters(), minPrice: 100 }}
        categories={[]}
        onChange={onChange}
        onReset={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/minimum price/i), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ minPrice: undefined });
  });

  it("calls onChange when maxPrice input changes", () => {
    const onChange = vi.fn();
    render(
      <CatalogFilterSidebar
        filters={defaultFilters()}
        categories={[]}
        onChange={onChange}
        onReset={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/maximum price/i), { target: { value: "500" } });
    expect(onChange).toHaveBeenCalledWith({ maxPrice: 500 });
  });

  it("calls onChange when rating select changes", () => {
    const onChange = vi.fn();
    render(
      <CatalogFilterSidebar
        filters={defaultFilters()}
        categories={[]}
        onChange={onChange}
        onReset={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/minimum rating/i), { target: { value: "4" } });
    expect(onChange).toHaveBeenCalledWith({ minRating: 4 });
  });

  it("calls onChange with undefined minRating when rating select resets to 'Any rating'", () => {
    const onChange = vi.fn();
    render(
      <CatalogFilterSidebar
        filters={{ ...defaultFilters(), minRating: 4 }}
        categories={[]}
        onChange={onChange}
        onReset={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/minimum rating/i), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ minRating: undefined });
  });

  it("calls onChange when in-stock checkbox is toggled", () => {
    const onChange = vi.fn();
    render(
      <CatalogFilterSidebar
        filters={defaultFilters()}
        categories={[]}
        onChange={onChange}
        onReset={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText(/in stock only/i));
    expect(onChange).toHaveBeenCalledWith({ inStockOnly: true });
  });

  it("shows 'Clear filters' button only when filters are active", () => {
    const { rerender } = render(
      <CatalogFilterSidebar
        filters={defaultFilters()}
        categories={[]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    // No active filters → no clear button
    expect(screen.queryByRole("button", { name: /clear filters/i })).toBeNull();

    // Active filters → clear button visible
    rerender(
      <CatalogFilterSidebar
        filters={{ ...defaultFilters(), inStockOnly: true }}
        categories={[]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeInTheDocument();
  });

  it("calls onReset when 'Clear filters' is clicked", () => {
    const onReset = vi.fn();
    render(
      <CatalogFilterSidebar
        filters={{ ...defaultFilters(), inStockOnly: true }}
        categories={[]}
        onChange={vi.fn()}
        onReset={onReset}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("has an accessible label on the aside element", () => {
    render(
      <CatalogFilterSidebar
        filters={defaultFilters()}
        categories={[]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByRole("complementary", { name: /filter products/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// MobileCatalogFilterDrawer
// ---------------------------------------------------------------------------

describe("MobileCatalogFilterDrawer", () => {
  it("renders the drawer panel with the correct role and aria-modal", () => {
    render(
      <MobileCatalogFilterDrawer
        open={true}
        onClose={vi.fn()}
        filters={defaultFilters()}
        categories={[]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: /filter products/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <MobileCatalogFilterDrawer
        open={true}
        onClose={onClose}
        filters={defaultFilters()}
        categories={[]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /close filter drawer/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <MobileCatalogFilterDrawer
        open={true}
        onClose={onClose}
        filters={defaultFilters()}
        categories={[]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    // The overlay div is the first child of the fragment
    const overlay = container.querySelector(".catalog-filter-overlay");
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed while open", () => {
    const onClose = vi.fn();
    render(
      <MobileCatalogFilterDrawer
        open={true}
        onClose={onClose}
        filters={defaultFilters()}
        categories={[]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not fire Escape handler when closed", () => {
    const onClose = vi.fn();
    render(
      <MobileCatalogFilterDrawer
        open={false}
        onClose={onClose}
        filters={defaultFilters()}
        categories={[]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders all filter controls (price, rating, stock) inside the drawer", () => {
    render(
      <MobileCatalogFilterDrawer
        open={true}
        onClose={vi.fn()}
        filters={defaultFilters()}
        categories={["Electronics"]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByRole("checkbox", { name: /Electronics/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/minimum price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/maximum price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/minimum rating/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/in stock only/i)).toBeInTheDocument();
  });

  it("calls onChange when filters are applied from the drawer", () => {
    const onChange = vi.fn();
    render(
      <MobileCatalogFilterDrawer
        open={true}
        onClose={vi.fn()}
        filters={defaultFilters()}
        categories={["Electronics"]}
        onChange={onChange}
        onReset={vi.fn()}
      />
    );

    // Toggle a category
    fireEvent.click(screen.getByRole("checkbox", { name: /Electronics/i }));
    expect(onChange).toHaveBeenCalledWith({ categories: ["Electronics"] });
  });

  it("does not reset active filters when the drawer is just closed", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    const activeFilters: CatalogFilterState = {
      ...DEFAULT_CATALOG_FILTERS,
      categories: ["Electronics"],
      inStockOnly: true,
    };

    const { rerender } = render(
      <MobileCatalogFilterDrawer
        open={true}
        onClose={onClose}
        filters={activeFilters}
        categories={["Electronics"]}
        onChange={onChange}
        onReset={vi.fn()}
      />
    );

    // Close the drawer (simulated by parent flipping open=false)
    rerender(
      <MobileCatalogFilterDrawer
        open={false}
        onClose={onClose}
        filters={activeFilters}
        categories={["Electronics"]}
        onChange={onChange}
        onReset={vi.fn()}
      />
    );

    // Filters must not have been touched
    expect(onChange).not.toHaveBeenCalled();
  });

  it("the open class is applied to overlay and panel when open=true", () => {
    const { container } = render(
      <MobileCatalogFilterDrawer
        open={true}
        onClose={vi.fn()}
        filters={defaultFilters()}
        categories={[]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(container.querySelector(".catalog-filter-overlay.open")).not.toBeNull();
    expect(container.querySelector(".catalog-filter-drawer.open")).not.toBeNull();
  });

  it("the open class is absent when open=false", () => {
    const { container } = render(
      <MobileCatalogFilterDrawer
        open={false}
        onClose={vi.fn()}
        filters={defaultFilters()}
        categories={[]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(container.querySelector(".catalog-filter-overlay.open")).toBeNull();
    expect(container.querySelector(".catalog-filter-drawer.open")).toBeNull();
  });
});
