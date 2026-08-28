import type { CancellationGrace, EscrowStatus } from "@delegolabs/types";

/**
 * Pure helpers for the cancel-within-grace-period undo flow (#580). Kept
 * side-effect free so the clock-skew math, and the race resolution between a
 * user-triggered undo and server-side expiration, can be unit tested without
 * timers or network mocks — see `hooks/useCancelGrace.ts` for the stateful
 * wiring around these.
 */

/**
 * Offset (ms) between the client's clock and the server's, computed from a
 * server-issued `serverTimestamp` and the client's own clock reading at the
 * moment that timestamp was received. Positive means the client is ahead.
 *
 * Compute this once per grace payload (when it's received), not on every
 * tick — the offset is assumed constant for the life of that payload; only
 * `clientNow` should advance on subsequent calls.
 */
export function computeClockSkewMs(
  serverTimestamp: string,
  clientNowAtReceipt: Date
): number {
  return clientNowAtReceipt.getTime() - new Date(serverTimestamp).getTime();
}

/**
 * Milliseconds remaining in the grace window, floored at 0. Always resolved
 * against the server-issued `graceExpiresAt`, with the client's current
 * clock corrected by the previously-computed `skewMs` — so a fast or slow
 * local clock never changes when the countdown reaches zero.
 */
export function getGraceRemainingMs(
  grace: CancellationGrace,
  clientNow: Date,
  skewMs: number
): number {
  const correctedNowMs = clientNow.getTime() - skewMs;
  const expiresAtMs = new Date(grace.graceExpiresAt).getTime();
  return Math.max(0, expiresAtMs - correctedNowMs);
}

/** True once the (skew-corrected) grace window has elapsed. */
export function isGraceExpired(
  grace: CancellationGrace,
  clientNow: Date,
  skewMs: number
): boolean {
  return getGraceRemainingMs(grace, clientNow, skewMs) <= 0;
}

export type GraceReconcileAction = "keep_cancelling" | "restore" | "finalize";

/**
 * Deterministically reconciles a locally-tracked grace state against a fresh
 * server read. The server is always the source of truth: if it no longer
 * reports an active cancellation, the local state must yield — either
 * because the undo already landed (`restore`) or because the grace period
 * had already elapsed and the server finalized it first (`finalize`), which
 * is exactly the race between a user's undo click and server-side expiry
 * that this resolves deterministically in the server's favor.
 */
export function reconcileGraceState(
  serverEscrowStatus: EscrowStatus,
  serverCancellation: CancellationGrace | null | undefined
): GraceReconcileAction {
  if (serverCancellation) return "keep_cancelling";
  if (serverEscrowStatus === "cancelled") return "finalize";
  return "restore";
}
