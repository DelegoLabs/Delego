import { describe, it, expect, vi, beforeEach } from "vitest";
import { clearAllLocalData } from "./localDataClear";

const mockClearConsentJournal = vi.fn();
vi.mock("../services/consentJournal", () => ({
  clearConsentJournal: () => mockClearConsentJournal(),
}));

const mockClearQueue = vi.fn();
vi.mock("./offlineQueue", () => ({
  clearQueue: (...args: unknown[]) => mockClearQueue(...args),
}));

describe("clearAllLocalData (#610 local-only tier)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockClearConsentJournal.mockReset();
    mockClearQueue.mockReset();
    mockClearQueue.mockResolvedValue(undefined);
  });

  it("removes every known exact data key that's present", async () => {
    window.localStorage.setItem("delego_tracked_txs", "[]");
    window.localStorage.setItem("delego_local_approval_notes", "{}");
    window.localStorage.setItem("delego_dismissed_announcements", "[]");
    window.localStorage.setItem("delego_notifications", "[]");
    window.localStorage.setItem("delego_delegation_tags", "{}");

    const result = await clearAllLocalData();

    for (const key of [
      "delego_tracked_txs",
      "delego_local_approval_notes",
      "delego_dismissed_announcements",
      "delego_notifications",
      "delego_delegation_tags",
    ]) {
      expect(window.localStorage.getItem(key)).toBeNull();
      expect(result.clearedKeys).toContain(key);
    }
  });

  it("sweeps every per-resource-id key matching a known prefix", async () => {
    window.localStorage.setItem("delego_address_book_public", "[]");
    window.localStorage.setItem("delego:escrow-timeline:escrow-1", "[]");
    window.localStorage.setItem("delego:cancel-grace:escrow-1", "{}");
    window.localStorage.setItem("delego:cancel-grace:escrow-2", "{}");

    const result = await clearAllLocalData();

    expect(window.localStorage.getItem("delego_address_book_public")).toBeNull();
    expect(window.localStorage.getItem("delego:escrow-timeline:escrow-1")).toBeNull();
    expect(window.localStorage.getItem("delego:cancel-grace:escrow-1")).toBeNull();
    expect(window.localStorage.getItem("delego:cancel-grace:escrow-2")).toBeNull();
    expect(result.clearedKeys.length).toBe(4);
  });

  it("never touches unrelated UI-preference keys", async () => {
    window.localStorage.setItem("delego-theme-mode", "dark");
    window.localStorage.setItem("delego_onboarding_complete", "true");

    await clearAllLocalData();

    expect(window.localStorage.getItem("delego-theme-mode")).toBe("dark");
    expect(window.localStorage.getItem("delego_onboarding_complete")).toBe("true");
  });

  it("calls clearConsentJournal and clearQueue", async () => {
    const result = await clearAllLocalData();

    expect(mockClearConsentJournal).toHaveBeenCalled();
    expect(mockClearQueue).toHaveBeenCalled();
    expect(result.offlineQueueCleared).toBe(true);
  });

  it("reports offlineQueueCleared: false if clearQueue rejects", async () => {
    mockClearQueue.mockRejectedValue(new Error("IndexedDB unavailable"));

    const result = await clearAllLocalData();

    expect(result.offlineQueueCleared).toBe(false);
  });

  it("returns an empty clearedKeys list when nothing was stored", async () => {
    const result = await clearAllLocalData();
    expect(result.clearedKeys).toEqual([]);
  });
});
