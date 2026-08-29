import { describe, it, expect, beforeEach } from "vitest";
import {
  setLocalApprovalNote,
  getLocalApprovalNote,
  clearLocalApprovalNote,
} from "./localApprovalNotes";

describe("localApprovalNotes", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null for an order with no local note", () => {
    expect(getLocalApprovalNote("order-1")).toBeNull();
  });

  it("round-trips a note for an order", () => {
    setLocalApprovalNote("order-1", "Substitute store brand");
    expect(getLocalApprovalNote("order-1")).toBe("Substitute store brand");
  });

  it("keeps notes for different orders independent", () => {
    setLocalApprovalNote("order-1", "Note A");
    setLocalApprovalNote("order-2", "Note B");
    expect(getLocalApprovalNote("order-1")).toBe("Note A");
    expect(getLocalApprovalNote("order-2")).toBe("Note B");
  });

  it("overwrites an existing note for the same order", () => {
    setLocalApprovalNote("order-1", "First");
    setLocalApprovalNote("order-1", "Second");
    expect(getLocalApprovalNote("order-1")).toBe("Second");
  });

  it("clears a note for an order without affecting others", () => {
    setLocalApprovalNote("order-1", "Note A");
    setLocalApprovalNote("order-2", "Note B");
    clearLocalApprovalNote("order-1");
    expect(getLocalApprovalNote("order-1")).toBeNull();
    expect(getLocalApprovalNote("order-2")).toBe("Note B");
  });

  it("returns null when the stored value is corrupted JSON", () => {
    localStorage.setItem("delego_local_approval_notes", "{not-json");
    expect(getLocalApprovalNote("order-1")).toBeNull();
  });
});
