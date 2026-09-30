import type { DisputeReason } from "@delegolabs/types";
import { DISPUTE_REASON_OPTIONS } from "./disputes";

/**
 * Editable "open dispute" form state — a subset of `CreateDisputeInput` shaped
 * for the modal's own controls. Kept separate from the hook so the pure
 * validation/normalization can be unit-tested without React.
 */
export interface DisputeDraft {
  reason: DisputeReason;
  description: string;
  evidenceUrls: string[];
}

/** Reason pre-selected when the modal (or a restored draft) has nothing stored. */
export const DEFAULT_DISPUTE_REASON: DisputeReason = "item_not_received";

export function createEmptyDisputeDraft(): DisputeDraft {
  return {
    reason: DEFAULT_DISPUTE_REASON,
    description: "",
    evidenceUrls: [""],
  };
}

const KNOWN_DISPUTE_REASONS: ReadonlySet<string> = new Set(
  DISPUTE_REASON_OPTIONS.map((option) => option.value)
);

/** True when `value` is one of the reasons the modal actually offers. */
export function isDisputeReason(value: unknown): value is DisputeReason {
  return typeof value === "string" && KNOWN_DISPUTE_REASONS.has(value);
}

/**
 * Validates a value read back from sessionStorage, returning a normalized
 * draft or `null` when the shape is unrecognizable (corrupt or foreign data).
 * An empty evidence list is normalized to a single blank row so the modal
 * always renders at least one URL input.
 */
export function normalizeDisputeDraft(value: unknown): DisputeDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<DisputeDraft>;
  if (!isDisputeReason(candidate.reason)) return null;
  if (typeof candidate.description !== "string") return null;
  if (
    !Array.isArray(candidate.evidenceUrls) ||
    !candidate.evidenceUrls.every((url) => typeof url === "string")
  ) {
    return null;
  }
  return {
    reason: candidate.reason,
    description: candidate.description,
    evidenceUrls:
      candidate.evidenceUrls.length > 0 ? candidate.evidenceUrls : [""],
  };
}
