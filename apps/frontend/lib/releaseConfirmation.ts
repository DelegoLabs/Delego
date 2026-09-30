/**
 * Pure helpers for the buyer "1-click delivery confirmation" flow (#707).
 *
 * Kept side-effect free so the payload shaping and rating validation can be
 * unit tested without a wallet, an RPC round-trip, or a rendered modal — the
 * stateful wiring lives in `components/escrows/ConfirmDeliveryButton.tsx` and
 * `components/escrows/ReleaseConfirmModal.tsx`.
 */

/** Minimum selectable merchant rating. */
export const MIN_FEEDBACK_RATING = 1;

/** Maximum selectable merchant rating. */
export const MAX_FEEDBACK_RATING = 5;

/** Upper bound applied to a trimmed satisfaction note. */
export const MAX_SATISFACTION_NOTE_LENGTH = 280;

/**
 * Payload emitted when a buyer acknowledges receipt and releases escrow
 * funds. Matches the contract/API shape documented in #707.
 *
 * Both rating fields are optional on purpose: a buyer must be able to confirm
 * delivery without rating the merchant, and a malformed rating must never
 * block a release.
 */
export interface ReleaseConfirmPayload {
  escrowId: string;
  orderId: string;
  /** Whole number from 1–5, or omitted when the buyer skipped the rating. */
  feedbackRating?: number;
  /** Trimmed, length-bounded note accompanying the rating; omitted when empty. */
  satisfactionNote?: string;
}

/**
 * Minimum shape needed to build a release payload. Accepts the escrow
 * identity fields directly so callers don't have to construct a full
 * `Escrow` (and tests don't have to fabricate one).
 */
export interface ReleaseTarget {
  /** Canonical escrow id. */
  escrowId?: string;
  /** Legacy id, kept as a fallback for older payloads. */
  id?: string;
  orderId: string;
}

/** Human-readable labels for each rating step, used in the rating control. */
export const FEEDBACK_RATING_LABELS: Record<number, string> = {
  1: "Very poor",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

/**
 * Resolves the escrow identity the same way `lib/escrows.ts#escrowKey` does:
 * `escrowId` first, then the legacy `id`. Duplicated rather than imported so
 * this module keeps accepting the minimal `ReleaseTarget` shape.
 */
export function resolveReleaseEscrowId(target: ReleaseTarget): string {
  return target.escrowId ?? target.id ?? "";
}

/** True when `value` is a whole number within 1–5 inclusive. */
export function isValidFeedbackRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_FEEDBACK_RATING &&
    value <= MAX_FEEDBACK_RATING
  );
}

/** Label for a rating value, or an empty string when out of range. */
export function feedbackRatingLabel(rating: number): string {
  return FEEDBACK_RATING_LABELS[rating] ?? "";
}

/**
 * Trims a free-text note and bounds it to `MAX_SATISFACTION_NOTE_LENGTH`.
 * Returns `undefined` for blank/whitespace-only input so the payload omits
 * the field entirely rather than sending an empty string.
 */
export function normalizeSatisfactionNote(
  note: string | null | undefined
): string | undefined {
  const trimmed = typeof note === "string" ? note.trim() : "";
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_SATISFACTION_NOTE_LENGTH);
}

/**
 * Builds the release payload from an escrow target plus the buyer's optional
 * rating input. Invalid ratings are dropped instead of throwing — the rating
 * is a nice-to-have and must never be the reason a release fails.
 */
export function buildReleaseConfirmPayload(
  target: ReleaseTarget,
  input: { rating?: number | null; note?: string | null } = {}
): ReleaseConfirmPayload {
  const payload: ReleaseConfirmPayload = {
    escrowId: resolveReleaseEscrowId(target),
    orderId: target.orderId,
  };

  if (isValidFeedbackRating(input.rating)) {
    payload.feedbackRating = input.rating;
  }

  const note = normalizeSatisfactionNote(input.note);
  if (note) {
    payload.satisfactionNote = note;
  }

  return payload;
}
