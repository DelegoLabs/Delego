import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEscrowTimeline } from "./useEscrowTimeline";

describe("useEscrowTimeline", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts from whatever was already persisted for the escrow", () => {
    window.localStorage.setItem(
      "delego:escrow-timeline:escrow-1",
      JSON.stringify([
        { id: "e1", type: "cancel_requested", title: "Cancellation requested", timestamp: "2026-01-01T00:00:00.000Z", status: "confirmed" },
      ])
    );
    const { result } = renderHook(() => useEscrowTimeline("escrow-1"));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.events[0].title).toBe("Cancellation requested");
  });

  it("appends entries and persists them", () => {
    const { result } = renderHook(() => useEscrowTimeline("escrow-1"));

    act(() => {
      result.current.append({
        type: "extension_requested",
        title: "Extension requested (+7d)",
        timestamp: "2026-01-02T00:00:00.000Z",
        status: "pending",
      });
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].status).toBe("pending");

    const { result: reloaded } = renderHook(() => useEscrowTimeline("escrow-1"));
    expect(reloaded.current.entries).toHaveLength(1);
  });

  it("updates an entry in place (optimistic → confirmed)", () => {
    const { result } = renderHook(() => useEscrowTimeline("escrow-1"));
    let id = "";
    act(() => {
      id = result.current.append({
        type: "extension_requested",
        title: "Extension requested (+7d)",
        timestamp: "2026-01-02T00:00:00.000Z",
        status: "pending",
      });
    });

    act(() => {
      result.current.update(id, { status: "confirmed" });
    });

    expect(result.current.entries[0].status).toBe("confirmed");
    expect(result.current.events[0].tone).toBe("success");
  });

  it("removes an entry (rollback on failure)", () => {
    const { result } = renderHook(() => useEscrowTimeline("escrow-1"));
    let id = "";
    act(() => {
      id = result.current.append({
        type: "extension_requested",
        title: "Extension requested (+7d)",
        timestamp: "2026-01-02T00:00:00.000Z",
        status: "pending",
      });
    });

    act(() => {
      result.current.remove(id);
    });

    expect(result.current.entries).toHaveLength(0);
  });

  it("keeps timelines isolated per escrow id", () => {
    const { result: a } = renderHook(() => useEscrowTimeline("escrow-a"));
    const { result: b } = renderHook(() => useEscrowTimeline("escrow-b"));

    act(() => {
      a.current.append({
        type: "cancel_requested",
        title: "Cancellation requested",
        timestamp: "2026-01-01T00:00:00.000Z",
        status: "pending",
      });
    });

    expect(a.current.entries).toHaveLength(1);
    expect(b.current.entries).toHaveLength(0);
  });
});
