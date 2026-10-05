import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { InteractiveTrackingTimeline, type TrackingCheckpoint } from "./InteractiveTrackingTimeline";

const checkpoints: TrackingCheckpoint[] = [
  {
    title: "Picked up",
    location: "Rotterdam Hub",
    timestamp: new Date("2024-05-01T09:00:00Z"),
    status: "completed",
    notes: "Loaded onto vessel",
  },
  {
    title: "In transit",
    location: "North Sea",
    timestamp: new Date("2024-05-02T09:00:00Z"),
    status: "current",
  },
  {
    title: "Delivered",
    location: "Oslo DC",
    timestamp: new Date("2024-05-03T09:00:00Z"),
    status: "upcoming",
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InteractiveTrackingTimeline", () => {
  it("renders every checkpoint with its location and notes", () => {
    render(<InteractiveTrackingTimeline checkpoints={checkpoints} />);

    expect(screen.getByText("Picked up")).toBeInTheDocument();
    expect(screen.getByText("Rotterdam Hub")).toBeInTheDocument();
    expect(screen.getByText("Loaded onto vessel")).toBeInTheDocument();
    expect(screen.getByText("In transit")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
    expect(screen.getByText("Oslo DC")).toBeInTheDocument();
  });

  it("computes progress from completed checkpoints", () => {
    render(<InteractiveTrackingTimeline checkpoints={checkpoints} />);

    // 1 of 2 completed segments => 50%
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("reports zero progress and no items when there are no checkpoints", () => {
    render(<InteractiveTrackingTimeline checkpoints={[]} />);

    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("prefers polled data over the initial checkpoints", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => [
          { ...checkpoints[0], status: "current", notes: undefined },
          { ...checkpoints[1], status: "completed" },
        ],
      }),
    );

    render(<InteractiveTrackingTimeline checkpoints={checkpoints} trackingId="TRK-1" />);

    await waitFor(() => {
      expect(screen.queryByText("Delivered")).not.toBeInTheDocument();
    });
  });

  it("does not poll when no tracking id is provided", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<InteractiveTrackingTimeline checkpoints={checkpoints} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});