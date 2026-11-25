// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../messages/en.json";
import { useOrders } from "../../hooks/useOrders";

vi.mock("../../hooks/useOrders", () => ({ useOrders: vi.fn() }));
vi.mock("../../components/orders/OrderTrackingCard", () => ({
  OrderTrackingCard: ({ order }: { order: { id: string } }) => (
    <div data-testid={`tracking-card-${order.id}`}>Order {order.id}</div>
  ),
}));

function setup(orders: ReturnType<typeof useOrders>["orders"] = []) {
  vi.mocked(useOrders).mockReturnValue({
    orders,
    loading: false,
    error: null,
    lastUpdated: new Date("2026-01-01T12:00:00.000Z"),
    refresh: vi.fn(),
    stale: false,
    cachedAt: null,
    ttlMs: 0,
    pendingIds: new Set(),
    pendingOfflineIds: new Set(),
    conflictMutations: [],
  });

  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <TrackingPage />
    </NextIntlClientProvider>
  );
}

import TrackingPage from "./page";

describe("TrackingPage localization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders translated title and description", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Order Tracking"
    );
    expect(screen.getByText("Follow in-flight orders as their status updates in real time")).toBeInTheDocument();
  });

  it("renders live indicator with translated text", () => {
    setup();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText(/updated/)).toBeInTheDocument();
  });

  it("renders refresh button with translated label", () => {
    setup();
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("shows 'No orders are currently in flight' when no active orders", () => {
    setup([]);
    expect(screen.getByText("No orders are currently in flight.")).toBeInTheDocument();
  });

  it("shows completed orders section with translated toggle", () => {
    const completedOrder = {
      id: "order-2",
      delegationId: "delegation-1",
      merchantId: "merchant-1",
      status: "fulfilled" as const,
      totalStroops: 10_000_000n,
      createdAt: "2026-01-01T10:00:00.000Z",
      updatedAt: "2026-01-02T12:00:00.000Z",
    };
    setup([completedOrder]);
    expect(screen.getByRole("button", { name: "Show completed (1)" })).toBeInTheDocument();
  });

  it("shows error message when error occurs", () => {
    vi.mocked(useOrders).mockReturnValue({
      orders: [],
      loading: false,
      error: "Failed to load orders",
      lastUpdated: null,
      refresh: vi.fn(),
      stale: false,
      cachedAt: null,
      ttlMs: 0,
      pendingIds: new Set(),
      pendingOfflineIds: new Set(),
      conflictMutations: [],
    });
    setup([]);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load orders");
    expect(screen.getByRole("alert")).toHaveAttribute("aria-label", "Error loading orders");
  });
});