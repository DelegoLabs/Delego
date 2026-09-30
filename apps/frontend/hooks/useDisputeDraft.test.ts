import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useDisputeDraft } from "./useDisputeDraft";

const KEY_A = "delego_dispute_draft:escrow-a";

describe("useDisputeDraft (#746)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("starts from an empty draft and reports hydrated", async () => {
    const { result } = renderHook(() => useDisputeDraft("escrow-a"));

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.draft.reason).toBe("item_not_received");
    expect(result.current.draft.description).toBe("");
    expect(result.current.draft.evidenceUrls).toEqual([""]);
  });

  it("persists changes and restores them on a fresh mount", async () => {
    const { result, unmount } = renderHook(() => useDisputeDraft("escrow-a"));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.updateDraft({
        reason: "not_as_described",
        description: "The screen arrived cracked",
        evidenceUrls: ["https://evidence.example/photo.jpg"],
      });
    });
    unmount();

    const { result: restored } = renderHook(() => useDisputeDraft("escrow-a"));
    await waitFor(() =>
      expect(restored.current.draft.description).toBe(
        "The screen arrived cracked"
      )
    );
    expect(restored.current.draft.reason).toBe("not_as_described");
    expect(restored.current.draft.evidenceUrls).toEqual([
      "https://evidence.example/photo.jpg",
    ]);
  });

  it("keeps drafts separated by escrow id", async () => {
    const first = renderHook(() => useDisputeDraft("escrow-a"));
    await waitFor(() => expect(first.result.current.hydrated).toBe(true));
    act(() => {
      first.result.current.updateDraft({
        reason: "other",
        description: "Only for escrow a",
        evidenceUrls: [""],
      });
    });
    first.unmount();

    const second = renderHook(() => useDisputeDraft("escrow-b"));
    await waitFor(() => expect(second.result.current.hydrated).toBe(true));
    expect(second.result.current.draft.description).toBe("");

    const revisited = renderHook(() => useDisputeDraft("escrow-a"));
    await waitFor(() =>
      expect(revisited.result.current.draft.description).toBe(
        "Only for escrow a"
      )
    );
  });

  it("clearDraft removes the stored value and resets the draft", async () => {
    const { result } = renderHook(() => useDisputeDraft("escrow-a"));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.updateDraft({
        reason: "item_not_received",
        description: "Half-written",
        evidenceUrls: ["https://evidence.example/1"],
      });
    });
    expect(window.sessionStorage.getItem(KEY_A)).not.toBeNull();

    act(() => result.current.clearDraft());

    expect(result.current.draft.description).toBe("");
    expect(result.current.draft.evidenceUrls).toEqual([""]);
    expect(window.sessionStorage.getItem(KEY_A)).toBeNull();
  });

  it("ignores malformed stored JSON", async () => {
    window.sessionStorage.setItem(KEY_A, "not-json");
    const { result } = renderHook(() => useDisputeDraft("escrow-a"));

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.draft.description).toBe("");
  });

  it("ignores stored drafts with an unrecognized reason", async () => {
    window.sessionStorage.setItem(
      KEY_A,
      JSON.stringify({
        reason: "definitely_not_a_reason",
        description: "Should be discarded",
        evidenceUrls: ["https://evidence.example/1"],
      })
    );
    const { result } = renderHook(() => useDisputeDraft("escrow-a"));

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.draft.reason).toBe("item_not_received");
    expect(result.current.draft.description).toBe("");
  });

  it("never touches storage when no escrow id is provided", async () => {
    const { result } = renderHook(() => useDisputeDraft(undefined));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.updateDraft({
        reason: "other",
        description: "in-memory only",
        evidenceUrls: [""],
      });
    });

    expect(result.current.draft.description).toBe("in-memory only");
    expect(window.sessionStorage.length).toBe(0);
  });
});
