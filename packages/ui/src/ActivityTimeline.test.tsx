import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ActivityTimeline, type ActivityEvent } from "./ActivityTimeline.js";

describe("ActivityTimeline", () => {
  afterEach(cleanup);

  it("renders an empty state when there are no events", () => {
    render(<ActivityTimeline events={[]} />);
    expect(screen.getByText("No activity yet.")).toBeDefined();
  });

  it("renders each event's label and amount", () => {
    const events: ActivityEvent[] = [
      { id: "1", label: "Refund requested", tone: "neutral", timestamp: new Date("2026-01-01T00:00:00Z") },
      {
        id: "2",
        label: "Refund settled",
        tone: "positive",
        timestamp: new Date("2026-01-02T00:00:00Z"),
        amount: "12.5 XLM",
      },
    ];
    render(<ActivityTimeline events={events} />);

    expect(screen.getByText("Refund requested")).toBeDefined();
    expect(screen.getByText(/Refund settled/)).toBeDefined();
    expect(screen.getByText(/12\.5 XLM/)).toBeDefined();
  });

  it("renders events in the order given", () => {
    const events: ActivityEvent[] = [
      { id: "1", label: "First", tone: "neutral", timestamp: new Date("2026-01-01T00:00:00Z") },
      { id: "2", label: "Second", tone: "negative", timestamp: new Date("2026-01-02T00:00:00Z") },
    ];
    const { container } = render(<ActivityTimeline events={events} />);
    const labels = Array.from(container.querySelectorAll("li")).map((li) => li.textContent);
    expect(labels[0]).toContain("First");
    expect(labels[1]).toContain("Second");
  });
});
