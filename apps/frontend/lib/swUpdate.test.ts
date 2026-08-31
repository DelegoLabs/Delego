import { describe, it, expect } from "vitest";
import {
  changelogFromAnnouncements,
  isBlockingOverlayOpen,
  isDeferralExpired,
  shouldApplyUpdate,
  SW_UPDATE_MAX_DEFERRAL_MS,
  updatePromptCopy,
} from "./swUpdate";

describe("swUpdate (#626)", () => {
  it("treats waiting→ready to apply only after a deferred navigation", () => {
    expect(
      shouldApplyUpdate({
        hasWaitingWorker: true,
        overlayOpen: false,
        deferred: true,
        expired: false,
        navigating: true,
      })
    ).toBe(true);
  });

  it("never reloads while a modal/drawer is open", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div role="dialog" aria-modal="true">drawer</div>`;
    expect(isBlockingOverlayOpen(root)).toBe(true);
    expect(
      shouldApplyUpdate({
        hasWaitingWorker: true,
        overlayOpen: true,
        deferred: true,
        expired: true,
        navigating: true,
      })
    ).toBe(false);
  });

  it("expires a deferral after 7 days of wall-clock time (tab-sleep safe)", () => {
    const deferredAt = 1_000;
    expect(isDeferralExpired(deferredAt, deferredAt + SW_UPDATE_MAX_DEFERRAL_MS - 1)).toBe(
      false
    );
    expect(isDeferralExpired(deferredAt, deferredAt + SW_UPDATE_MAX_DEFERRAL_MS)).toBe(
      true
    );
    // A sleeping tab that wakes 8 days later still expires — we use Date.now(),
    // not setTimeout, so throttling in the background cannot stall this check.
    const eightDays = SW_UPDATE_MAX_DEFERRAL_MS + 24 * 60 * 60 * 1000;
    expect(isDeferralExpired(deferredAt, deferredAt + eightDays)).toBe(true);
  });

  it("uses urgency copy once the deferral cap is hit", () => {
    const copy = updatePromptCopy(true, "Dispute filing is live.");
    expect(copy.title).toMatch(/required/i);
    expect(copy.body).toContain("Dispute filing");
  });

  it("prefers the version-keyed announcement changelog (fE-038)", () => {
    const snippet = changelogFromAnnouncements(
      [
        { version: "v0", message: "old", changelog: "Old notes" },
        { version: "v1", message: "new", changelog: "Dispute filing is now live." },
      ],
      "v1"
    );
    expect(snippet).toBe("Dispute filing is now live.");
  });
});
