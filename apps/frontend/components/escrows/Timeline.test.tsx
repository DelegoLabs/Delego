import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timeline } from "./Timeline";
import { writeTimelineEntries } from "../../lib/escrowTimeline";

describe("Timeline", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the empty message when there is no history yet", () => {
    render(<Timeline escrowId="escrow-1" />);
    expect(screen.getByText("No activity recorded yet.")).toBeDefined();
  });

  it("renders persisted events for the given escrow", () => {
    writeTimelineEntries("escrow-1", [
      {
        id: "e1",
        type: "cancel_requested",
        title: "Cancellation requested",
        timestamp: "2026-01-01T00:00:00.000Z",
        status: "confirmed",
      },
    ]);
    render(<Timeline escrowId="escrow-1" />);
    expect(screen.getByText("Cancellation requested")).toBeDefined();
  });

  it("does not leak another escrow's timeline", () => {
    writeTimelineEntries("escrow-other", [
      {
        id: "e1",
        type: "cancel_requested",
        title: "Cancellation requested",
        timestamp: "2026-01-01T00:00:00.000Z",
        status: "confirmed",
      },
    ]);
    render(<Timeline escrowId="escrow-1" />);
    expect(screen.queryByText("Cancellation requested")).toBeNull();
  });
});
