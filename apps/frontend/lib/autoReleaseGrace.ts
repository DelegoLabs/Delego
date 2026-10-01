/**
 * Pure helpers for the escrow auto-release grace window (#715).
 *
 * When an auto-release is scheduled, the buyer gets a grace window (8 hours by
 * default) to pause the payout if the package hasn't actually arrived. The
 * banner counts down against the server-issued `graceExpiresAt`, so the maths
 * is isolated here and unit tested without timers.
 */

/** Grace window length used when the server doesn't state one. */
export const DEFAULT_AUTO_RELEASE_GRACE_HOURS = 8;

/** Milliseconds remaining in the grace window, floored at 0. */
export function getAutoReleaseGraceRemainingMs(
  graceExpiresAt: string,
  now: Date
): number {
  const expiresAtMs = new Date(graceExpiresAt).getTime();
  if (Number.isNaN(expiresAtMs)) return 0;
  return Math.max(0, expiresAtMs - now.getTime());
}

/**
 * True once the grace window has elapsed — the banner auto-dismisses and the
 * release is considered final at this point.
 */
export function isAutoReleaseGraceExpired(
  graceExpiresAt: string,
  now: Date
): boolean {
  return getAutoReleaseGraceRemainingMs(graceExpiresAt, now) <= 0;
}

/**
 * Ticking seconds countdown for the banner: `7:59:59` above an hour, `9:04`
 * below it. Rounds *up* so the display only reads `0:00` once the window has
 * genuinely closed.
 */
export function formatGraceCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedSeconds = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

/**
 * Human-readable window length for the copy ("8 hours", "1 hour", "45
 * minutes"), derived from the original window rather than the live remaining
 * time so the sentence doesn't drift while it counts down.
 */
export function formatGraceWindow(remainingMs: number): string {
  const totalMinutes = Math.round(Math.max(0, remainingMs) / 60_000);
  if (totalMinutes >= 60) {
    const hours = Math.round(totalMinutes / 60);
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  if (totalMinutes >= 1) {
    return `${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"}`;
  }
  const seconds = Math.max(0, Math.round(remainingMs / 1000));
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}
