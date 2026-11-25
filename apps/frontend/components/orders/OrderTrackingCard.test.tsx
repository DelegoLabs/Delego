// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import type { Order } from "@delegolabs/types";
import { CurrencyProvider } from "../../hooks/useCurrency";
import { OrderTrackingCard } from "./OrderTrackingCard";
import enMessages from "../../messages/en.json";

const order: Order = {
  id: "order-17",
  delegationId: "delegation-1",
  merchantId: "merchant-1",
  status: "fulfilled",
  totalStroops: 25_000_000n,
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-02T12:00:00.000Z",
  packages: [
    {
      packageId: "box-a",
      carrierName: "UPS",
      trackingNumber: "1Z999AA10123456784",
      status: "in_transit",
      events: [
        {
          status: "label_created",
          timestamp: "2026-01-01T11:00:00.000Z",
          location: "Lagos",
          description: "Label created",
        },
        {
          status: "in_transit",
          timestamp: "2026-01-02T12:00:00.000Z",
          location: "Abuja",
          description: "Package scanned",
        },
      ],
    },
    {
      packageId: "box-b",
      carrierName: "FedEx",
      trackingNumber: "123456789012",
      status: "delivered",
      estimatedDelivery: "2026-01-02T12:00:00.000Z",
      events: [
        {
          status: "delivered",
          timestamp: "2026-01-02T12:00:00.000Z",
          location: "Kano",
          description: "Delivered",
        },
      ],
    },
  ],
};

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <CurrencyProvider>
        <OrderTrackingCard order={order} />
      </CurrencyProvider>
    </NextIntlClientProvider>
  );
}

describe("OrderTrackingCard multi-package tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows separate package tabs, progress, events, and carrier links", () => {
    renderCard();

    expect(
      screen.getByRole("tablist", { name: "Order packages" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Package 1 · UPS" })
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("progressbar", { name: "Package 1 delivery progress" })
    ).toHaveAttribute("aria-valuenow", "33.33333333333333");
    expect(screen.getByText("Package scanned")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Track on UPS" })).toHaveAttribute(
      "href",
      "https://www.ups.com/track?tracknum=1Z999AA10123456784"
    );

    fireEvent.keyDown(screen.getByRole("tab", { name: "Package 1 · UPS" }), {
      key: "ArrowRight",
    });
    expect(
      screen.getByRole("tab", { name: "Package 2 · FedEx" })
    ).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100"
    );
    expect(within(panel).getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "Delivered"
    );
  });

  it("renders translated card title and aria labels", () => {
    renderCard();
    expect(screen.getByText("Order order-17")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tracking for order order-17" })).toBeInTheDocument();
  });

  it("renders translated package section heading", () => {
    renderCard();
    expect(screen.getByText("Packages (2)")).toBeInTheDocument();
  });

  it("renders translated detail labels", () => {
    renderCard();
    expect(screen.getByText("Merchant")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Escrow")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("renders translated status labels", () => {
    renderCard();
    expect(screen.getByText("Label created")).toBeInTheDocument();
    expect(screen.getByText("In transit")).toBeInTheDocument();
    expect(screen.getByText("Out for delivery")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
  });

  it("renders translated delivery progress and progress bar labels", () => {
    renderCard();
    expect(screen.getByText("Delivery progress")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Package 1 delivery progress" })).toBeInTheDocument();
  });

  it("renders 'Not provided' for missing estimated delivery", () => {
    renderCard();
    expect(screen.getByText("Not provided")).toBeInTheDocument();
  });
});
