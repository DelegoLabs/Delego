import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import {
  ShipmentTracker,
  carrierTrackingUrl,
  sortMilestones,
  type TrackingMilestone,
} from "./ShipmentTracker.js";

const milestones: TrackingMilestone[] = [
  {
    status: "in_transit",
    location: "Memphis, TN",
    timestamp: "2026-03-02T12:00:00.000Z",
    description: "Departed facility",
  },
  {
    status: "label_created",
    location: "Austin, TX",
    timestamp: "2026-03-01T15:00:00.000Z",
    description: "Carrier picked up the parcel",
  },
];

describe("carrierTrackingUrl", () => {
  it("builds official links for known carriers", () => {
    expect(carrierTrackingUrl("UPS", "1Z999")).toBe(
      "https://www.ups.com/track?tracknum=1Z999"
    );
    expect(carrierTrackingUrl("FedEx Express", "123 456")).toBe(
      "https://www.fedex.com/fedextrack/?trknbr=123%20456"
    );
    expect(carrierTrackingUrl("U.S. Postal Service", "9400")).toContain("tools.usps.com");
    expect(carrierTrackingUrl("upside courier", "1")).toBeNull();
    expect(carrierTrackingUrl("DHL", "JJD")).toContain("dhl.com");
  });

  it("does not invent a link for an unknown carrier or a blank number", () => {
    expect(carrierTrackingUrl("Local Courier", "ABC")).toBeNull();
    expect(carrierTrackingUrl("UPS", "   ")).toBeNull();
  });
});

describe("sortMilestones", () => {
  it("keeps original order when timestamps tie", () => {
    const tied: TrackingMilestone[] = [
      {
        status: "label_created",
        location: "",
        timestamp: "2026-03-01T00:00:00.000Z",
        description: "",
      },
      {
        status: "in_transit",
        location: "Hub",
        timestamp: "2026-03-01T00:00:00.000Z",
        description: "Moving",
      },
      {
        status: "exception",
        location: "Hub",
        timestamp: "bad",
        description: "Held",
      },
      {
        status: "delivered",
        location: "Home",
        timestamp: "also-bad",
        description: "Done",
      },
    ];
    expect(sortMilestones(tied).map((step) => step.status)).toEqual([
      "label_created",
      "in_transit",
      "exception",
      "delivered",
    ]);
    expect(
      sortMilestones([
        {
          status: "exception",
          location: "Hub",
          timestamp: "nope",
          description: "Held",
        },
        {
          status: "delivered",
          location: "Home",
          timestamp: "2026-05-01T00:00:00.000Z",
          description: "Left at the door",
        },
      ]).map((step) => step.status)
    ).toEqual(["delivered", "exception"]);
  });
});

describe("ShipmentTracker", () => {
  it("has no accessibility violations", async () => {
    const { container } = render(
      <ShipmentTracker
        carrier="UPS"
        trackingNumber="1Z999"
        milestones={milestones}
        estimatedDelivery="2026-03-05T18:00:00.000Z"
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders a vertical timeline in chronological order with an official link", () => {
    render(
      <ShipmentTracker
        carrier="UPS"
        trackingNumber="1Z999"
        milestones={milestones}
        estimatedDelivery="2026-03-05"
      />
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("Picked up");
    expect(items[1]?.textContent).toContain("In transit");
    const link = screen.getByRole("link", { name: "Track on UPS" });
    expect(link.getAttribute("href")).toBe("https://www.ups.com/track?tracknum=1Z999");
    expect(screen.getByText(/Estimated delivery/)).toBeDefined();
  });

  it("turns an exception amber and shows instructions", () => {
    render(
      <ShipmentTracker
        carrier="Local Courier"
        trackingNumber="ABC"
        milestones={[
          {
            status: "label_created",
            location: "",
            timestamp: "2026-03-02T08:00:00.000Z",
            description: "",
          },
          {
            status: "exception",
            location: "Regional hub",
            timestamp: "2026-03-03T08:00:00.000Z",
            description: "Address could not be read",
          },
        ]}
        estimatedDelivery="2026-03-06"
      />
    );
    const item = screen.getAllByRole("listitem").find((node) => node.getAttribute("data-status") === "exception");
    expect(item).toBeTruthy();
    expect(item?.textContent).toContain("Address could not be read");
    expect(item?.textContent).toContain("follow their instructions");
    const exceptionPanel = Array.from(item?.querySelectorAll("div") ?? []).find(
      (node) => node.style.backgroundColor === "rgb(254, 243, 199)"
    );
    expect(exceptionPanel).toBeTruthy();
    expect(screen.getByRole("button", { name: "Carrier tracking unavailable" })).toBeDisabled();
  });

  it("shows an empty state when there are no milestones", () => {
    render(
      <ShipmentTracker
        carrier="DHL"
        trackingNumber="JJD00"
        milestones={[]}
        estimatedDelivery="soon"
      />
    );
    expect(screen.getByText("No tracking updates yet.")).toBeDefined();
    expect(screen.getByText("Estimated delivery: soon")).toBeDefined();
  });
});
