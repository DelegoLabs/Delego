import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LowStockBannerAlert } from "./LowStockBannerAlert";

describe("LowStockBannerAlert", () => {
  it("does not render when depletedProductsCount is 0", () => {
    const { container } = render(
      <LowStockBannerAlert
        depletedProductsCount={0}
        criticalItemTitles={[]}
        onQuickRestockClick={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders prominent warning banner with role='alert' when items are depleted", () => {
    render(
      <LowStockBannerAlert
        depletedProductsCount={2}
        criticalItemTitles={["Widget A", "Widget B"]}
        onQuickRestockClick={vi.fn()}
      />
    );

    const banner = screen.getByRole("alert");
    expect(banner).toBeInTheDocument();
    expect(screen.getByText(/2 catalog items/i)).toBeInTheDocument();
    expect(screen.getByText(/Widget A, Widget B/i)).toBeInTheDocument();
  });

  it("renders red critical warning banner immediately when items run out of stock", () => {
    render(
      <LowStockBannerAlert
        depletedProductsCount={1}
        criticalItemTitles={["Depleted Widget"]}
        onQuickRestockClick={vi.fn()}
        hasOutOfStock={true}
      />
    );

    const banner = screen.getByTestId("low-stock-banner-alert");
    expect(banner).toHaveAttribute("data-severity", "red");
    expect(
      screen.getByText(/Critical Stock Warning: Depleted Catalog Items/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/out of stock or near depletion/i)).toBeInTheDocument();
  });

  it("renders amber warning banner when items are low on stock (< 5 items) but not out of stock", () => {
    render(
      <LowStockBannerAlert
        depletedProductsCount={3}
        criticalItemTitles={["Item 1", "Item 2", "Item 3"]}
        onQuickRestockClick={vi.fn()}
        hasOutOfStock={false}
        severity="amber"
      />
    );

    const banner = screen.getByTestId("low-stock-banner-alert");
    expect(banner).toHaveAttribute("data-severity", "amber");
    expect(
      screen.getByText(/Low Stock Warning: Action Required/i)
    ).toBeInTheDocument();
  });

  it("triggers 1-click onQuickRestockClick CTA when Restock button is clicked", () => {
    const handleRestock = vi.fn();
    render(
      <LowStockBannerAlert
        depletedProductsCount={1}
        criticalItemTitles={["Item A"]}
        onQuickRestockClick={handleRestock}
      />
    );

    const restockButton = screen.getByTestId("low-stock-restock-cta");
    expect(restockButton).toBeInTheDocument();
    fireEvent.click(restockButton);

    expect(handleRestock).toHaveBeenCalledTimes(1);
  });

  it("dismisses the banner when dismiss button is clicked", () => {
    const handleDismiss = vi.fn();
    render(
      <LowStockBannerAlert
        depletedProductsCount={2}
        criticalItemTitles={["Item 1", "Item 2"]}
        onQuickRestockClick={vi.fn()}
        onDismiss={handleDismiss}
      />
    );

    const dismissBtn = screen.getByTestId("low-stock-dismiss-button");
    fireEvent.click(dismissBtn);

    expect(handleDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
