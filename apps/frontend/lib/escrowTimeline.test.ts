import { describe, it, expect, beforeEach } from "vitest";
import {
  readTimelineEntries,
  writeTimelineEntries,
  toActivityTimelineEvents,
  type EscrowTimelineEntry,
} from "./escrowTimeline";

describe("escrowTimeline", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns an empty list when nothing has been persisted yet", () => {
    expect(readTimelineEntries("escrow-1")).toEqual([]);
  });

  it("round-trips entries through localStorage, scoped per escrow", () => {
    const entries: EscrowTimelineEntry[] = [
      {
        id: "e1",
        type: "cancel_requested",
        title: "Cancellation requested",
        timestamp: "2026-01-01T00:00:00.000Z",
        status: "pending",
      },
    ];
    writeTimelineEntries("escrow-1", entries);
    expect(readTimelineEntries("escrow-1")).toEqual(entries);
    expect(readTimelineEntries("escrow-2")).toEqual([]);
  });

  it("recovers gracefully from corrupted storage content", () => {
    window.localStorage.setItem("delego:escrow-timeline:escrow-1", "{not json");
    expect(readTimelineEntries("escrow-1")).toEqual([]);
  });

  it("maps entry status to a timeline tone when no explicit tone is set", () => {
    const entries: EscrowTimelineEntry[] = [
      { id: "a", type: "x", title: "Pending thing", timestamp: "2026-01-01T00:00:00.000Z", status: "pending" },
      { id: "b", type: "x", title: "Confirmed thing", timestamp: "2026-01-01T00:00:00.000Z", status: "confirmed" },
      { id: "c", type: "x", title: "Failed thing", timestamp: "2026-01-01T00:00:00.000Z", status: "failed" },
    ];
    const events = toActivityTimelineEvents(entries);
    expect(events.map((e) => e.tone)).toEqual(["pending", "success", "failed"]);
  });

  it("respects an explicit tone override", () => {
    const events = toActivityTimelineEvents([
      {
        id: "a",
        type: "x",
        title: "Refund",
        timestamp: "2026-01-01T00:00:00.000Z",
        status: "confirmed",
        tone: "refunded",
      },
    ]);
    expect(events[0].tone).toBe("refunded");
  });

  it("converts the ISO timestamp to a Date instance", () => {
    const events = toActivityTimelineEvents([
      { id: "a", type: "x", title: "T", timestamp: "2026-01-01T00:00:00.000Z", status: "confirmed" },
    ]);
    expect(events[0].timestamp).toBeInstanceOf(Date);
    expect(events[0].timestamp.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
