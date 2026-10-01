import { describe, it, expect } from "vitest";
import {
  createEmptyDisputeDraft,
  isDisputeReason,
  normalizeDisputeDraft,
} from "./disputeDraft";
import { DISPUTE_REASON_OPTIONS } from "./disputes";

describe("createEmptyDisputeDraft (#746)", () => {
  it("seeds the default reason and one blank evidence row", () => {
    const draft = createEmptyDisputeDraft();
    expect(draft.reason).toBe("item_not_received");
    expect(draft.description).toBe("");
    expect(draft.evidenceUrls).toEqual([""]);
  });
});

describe("isDisputeReason", () => {
  it("accepts every reason the modal offers", () => {
    for (const option of DISPUTE_REASON_OPTIONS) {
      expect(isDisputeReason(option.value)).toBe(true);
    }
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isDisputeReason("refund_me")).toBe(false);
    expect(isDisputeReason(3)).toBe(false);
    expect(isDisputeReason(null)).toBe(false);
  });
});

describe("normalizeDisputeDraft", () => {
  it("round-trips a valid stored draft", () => {
    const stored = {
      reason: "not_as_described",
      description: "Cracked screen",
      evidenceUrls: [
        "https://evidence.example/a",
        "https://evidence.example/b",
      ],
    };
    expect(normalizeDisputeDraft(stored)).toEqual(stored);
  });

  it("collapses an empty evidence list to a single blank row", () => {
    const normalized = normalizeDisputeDraft({
      reason: "other",
      description: "",
      evidenceUrls: [],
    });
    expect(normalized?.evidenceUrls).toEqual([""]);
  });

  it("rejects non-objects and missing or mistyped fields", () => {
    expect(normalizeDisputeDraft(null)).toBeNull();
    expect(normalizeDisputeDraft("x")).toBeNull();
    expect(normalizeDisputeDraft({})).toBeNull();
    expect(
      normalizeDisputeDraft({
        reason: "other",
        description: 12,
        evidenceUrls: [],
      })
    ).toBeNull();
    expect(
      normalizeDisputeDraft({
        reason: "other",
        description: "",
        evidenceUrls: ["ok", 12],
      })
    ).toBeNull();
  });

  it("rejects an unrecognized reason", () => {
    expect(
      normalizeDisputeDraft({
        reason: "made_up",
        description: "",
        evidenceUrls: [],
      })
    ).toBeNull();
  });
});
