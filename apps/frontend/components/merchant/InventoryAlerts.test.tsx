import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  LowStockBanner,
  SNOOZE_DURATION_MS,
  SNOOZED_ALERTS_STORAGE_KEY,
} from "./InventoryAlerts";
import type { StockedCatalogProduct } from "../../lib/inventoryStock";

const sampleProducts: StockedCatalogProduct[] = [
  { id: "p1", sku: "SKU-001", title: "Espresso Beans", stockQuantity: 2 },
  { id: "p2", sku: "SKU-002", title: "Oat Milk", stockQuantity: 0 },
  { id: "p3", sku: "SKU-003", title: "Ceramic Mug", stockQuantity: 25 },
];

describe("LowStockBanner snooze & acknowledge", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("snoozes an alert per SKU for 24h and persists across reloads", () => {
    const { unmount } = render(<LowStockBanner products={sampleProducts} />);

    expect(screen.getByText("2 products need attention")).toBeInTheDocument();
    expect(screen.getByText(/Espresso Beans \(SKU-001\)/)).toBeInTheDocument();
    expect(screen.getByText(/Oat Milk \(SKU-002\)/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Snooze Espresso Beans (SKU-001) for 24 hours" })
    );

    expect(screen.getByText("1 product need attention")).toBeInTheDocument();
    expect(screen.queryByText(/Espresso Beans \(SKU-001\)/)).not.toBeInTheDocument();
    expect(screen.getByText(/Oat Milk \(SKU-002\)/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View snoozed alerts (1)" })
    ).toBeInTheDocument();

    const stored = JSON.parse(
      window.localStorage.getItem(SNOOZED_ALERTS_STORAGE_KEY) ?? "{}"
    ) as Record<string, number>;
    expect(stored["SKU-001"]).toBeGreaterThan(Date.now());

    // Simulate page reload by unmounting and remounting
    unmount();
    render(<LowStockBanner products={sampleProducts} />);

    expect(screen.getByText("1 product need attention")).toBeInTheDocument();
    expect(screen.queryByText(/Espresso Beans \(SKU-001\)/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View snoozed alerts (1)" })
    ).toBeInTheDocument();
  });

  it("allows viewing and unsnoozing snoozed alerts", () => {
    render(<LowStockBanner products={sampleProducts} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Snooze Espresso Beans (SKU-001) for 24 hours" })
    );

    const toggleButton = screen.getByRole("button", { name: "View snoozed alerts (1)" });
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggleButton);

    expect(
      screen.getByRole("button", { name: "Hide snoozed alerts (1)" })
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("snoozed-alerts-list")).toHaveTextContent(
      "Espresso Beans (SKU-001)"
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Unsnooze Espresso Beans (SKU-001)" })
    );

    expect(screen.getByText("2 products need attention")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /snoozed alerts/i })
    ).not.toBeInTheDocument();
  });

  it("shows a compact snoozed state when all alerts are snoozed", () => {
    render(<LowStockBanner products={sampleProducts} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Snooze Espresso Beans (SKU-001) for 24 hours" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Snooze Oat Milk (SKU-002) for 24 hours" })
    );

    expect(screen.getByText("All 2 low-stock alerts snoozed for 24h.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View snoozed alerts (2)" })
    ).toBeInTheDocument();
  });

  it("re-surfaces alerts whose 24h snooze has expired", () => {
    const expiredAt = Date.now() - 1000;
    const activeAt = Date.now() + SNOOZE_DURATION_MS;
    window.localStorage.setItem(
      SNOOZED_ALERTS_STORAGE_KEY,
      JSON.stringify({ "SKU-001": expiredAt, "SKU-002": activeAt })
    );

    render(<LowStockBanner products={sampleProducts} />);

    expect(screen.getByText("1 product need attention")).toBeInTheDocument();
    expect(screen.getByText(/Espresso Beans \(SKU-001\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Oat Milk \(SKU-002\)/)).not.toBeInTheDocument();
  });
});
