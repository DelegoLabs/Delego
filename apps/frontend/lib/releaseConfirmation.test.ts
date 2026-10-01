import { describe, it, expect } from "vitest";
import {
  MAX_SATISFACTION_NOTE_LENGTH,
  buildReleaseConfirmPayload,
  feedbackRatingLabel,
  isValidFeedbackRating,
  normalizeSatisfactionNote,
  resolveReleaseEscrowId,
} from "./releaseConfirmation";

describe("isValidFeedbackRating", () => {
  it("accepts whole numbers from 1 to 5", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(isValidFeedbackRating(rating)).toBe(true);
    }
  });

  it("rejects out-of-range, fractional, and non-numeric values", () => {
    expect(isValidFeedbackRating(0)).toBe(false);
    expect(isValidFeedbackRating(6)).toBe(false);
    expect(isValidFeedbackRating(3.5)).toBe(false);
    expect(isValidFeedbackRating(-1)).toBe(false);
    expect(isValidFeedbackRating(null)).toBe(false);
    expect(isValidFeedbackRating("4")).toBe(false);
    expect(isValidFeedbackRating(undefined)).toBe(false);
  });
});

describe("resolveReleaseEscrowId", () => {
  it("prefers escrowId", () => {
    expect(resolveReleaseEscrowId({ escrowId: "esc-1", id: "legacy", orderId: "o" })).toBe(
      "esc-1"
    );
  });

  it("falls back to the legacy id, then to an empty string", () => {
    expect(resolveReleaseEscrowId({ id: "legacy", orderId: "o" })).toBe("legacy");
    expect(resolveReleaseEscrowId({ orderId: "o" })).toBe("");
  });
});

describe("normalizeSatisfactionNote", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeSatisfactionNote("  arrived early  ")).toBe("arrived early");
  });

  it("returns undefined for blank input so the payload omits the field", () => {
    expect(normalizeSatisfactionNote("")).toBeUndefined();
    expect(normalizeSatisfactionNote("   ")).toBeUndefined();
    expect(normalizeSatisfactionNote(null)).toBeUndefined();
    expect(normalizeSatisfactionNote(undefined)).toBeUndefined();
  });

  it("bounds the note length", () => {
    const note = normalizeSatisfactionNote("x".repeat(500));
    expect(note).toHaveLength(MAX_SATISFACTION_NOTE_LENGTH);
  });
});

describe("buildReleaseConfirmPayload", () => {
  const target = { escrowId: "esc-9", orderId: "order-9" };

  it("always includes the escrow and order identity", () => {
    expect(buildReleaseConfirmPayload(target)).toEqual({
      escrowId: "esc-9",
      orderId: "order-9",
    });
  });

  it("includes a valid rating and trimmed note", () => {
    expect(
      buildReleaseConfirmPayload(target, { rating: 5, note: "  great seller " })
    ).toEqual({
      escrowId: "esc-9",
      orderId: "order-9",
      feedbackRating: 5,
      satisfactionNote: "great seller",
    });
  });

  it("drops an invalid rating rather than throwing — the rating must never block a release", () => {
    const payload = buildReleaseConfirmPayload(target, { rating: 9 });
    expect(payload).not.toHaveProperty("feedbackRating");
    expect(payload).toEqual({ escrowId: "esc-9", orderId: "order-9" });
  });

  it("omits a blank note", () => {
    expect(buildReleaseConfirmPayload(target, { rating: 4, note: "   " })).toEqual({
      escrowId: "esc-9",
      orderId: "order-9",
      feedbackRating: 4,
    });
  });
});

describe("feedbackRatingLabel", () => {
  it("labels each step and returns empty for unknown values", () => {
    expect(feedbackRatingLabel(1)).toBe("Very poor");
    expect(feedbackRatingLabel(5)).toBe("Excellent");
    expect(feedbackRatingLabel(0)).toBe("");
  });
});
