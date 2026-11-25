import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useDisputeWizardDraft } from "./useDisputeWizardDraft";

const KEY = "delego_dispute_wizard_draft:escrow-a";
const SAVED_AT = "2026-11-24T12:34:56.000Z";

function seed(value: unknown) {
  window.sessionStorage.setItem(KEY, JSON.stringify(value));
}

function stored() {
  return JSON.parse(window.sessionStorage.getItem(KEY) ?? "null");
}

describe("useDisputeWizardDraft (#1227)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("persists only serializable fields and stamps them with savedAt", async () => {
    const { result } = renderHook(() => useDisputeWizardDraft("escrow-a"));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.updateDraft({
        reason: "damaged",
        description: "The screen arrived cracked.",
        requestedOutcome: "replacement",
        photoFiles: [new File(["x"], "crack.png", { type: "image/png" })],
      });
    });

    const value = stored();
    expect(value).toMatchObject({
      reason: "damaged",
      description: "The screen arrived cracked.",
      requestedOutcome: "replacement",
    });
    expect(value).not.toHaveProperty("photoFiles");
    expect(Number.isFinite(Date.parse(value.savedAt))).toBe(true);
    expect(result.current.savedAt).toBe(value.savedAt);
  });

  it("restores serializable fields and the saved timestamp on a fresh mount", async () => {
    seed({
      reason: "not_as_described",
      description: "Wrong colour",
      requestedOutcome: "full_refund",
      savedAt: SAVED_AT,
    });
    const { result } = renderHook(() => useDisputeWizardDraft("escrow-a"));

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.draft).toMatchObject({
      reason: "not_as_described",
      description: "Wrong colour",
      requestedOutcome: "full_refund",
    });
    expect(result.current.draft.photoFiles).toEqual([]);
    expect(result.current.savedAt).toBe(SAVED_AT);
  });

  it("clears the stored value and the displayed timestamp", async () => {
    const { result } = renderHook(() => useDisputeWizardDraft("escrow-a"));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.updateDraft({
        reason: "damaged",
        description: "Half-written",
        requestedOutcome: null,
        photoFiles: [],
      });
    });
    act(() => result.current.clearDraft());

    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(result.current.savedAt).toBeNull();
    expect(result.current.draft.description).toBe("");
  });

  it("discards corrupt drafts and invalid timestamps", async () => {
    seed({ reason: "damaged", description: "Valid", requestedOutcome: null, savedAt: "not-a-date" });
    const invalidTimestamp = renderHook(() => useDisputeWizardDraft("escrow-a"));
    await waitFor(() => expect(invalidTimestamp.result.current.hydrated).toBe(true));
    expect(invalidTimestamp.result.current.draft.description).toBe("Valid");
    expect(invalidTimestamp.result.current.savedAt).toBeNull();

    window.sessionStorage.setItem(KEY, "not-json");
    const corrupt = renderHook(() => useDisputeWizardDraft("escrow-a"));
    await waitFor(() => expect(corrupt.result.current.hydrated).toBe(true));
    expect(corrupt.result.current.draft.description).toBe("");
  });

  it("never touches storage without an escrow id", async () => {
    const { result } = renderHook(() => useDisputeWizardDraft(undefined));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.updateDraft({
        reason: "damaged",
        description: "In memory only",
        requestedOutcome: null,
        photoFiles: [],
      });
    });

    expect(result.current.draft.description).toBe("In memory only");
    expect(result.current.savedAt).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });
});
