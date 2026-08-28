/**
 * Idle-session keep-alive configuration (#514).
 *
 * An expired session mid-task hard-redirects to /login (see `onUnauthorized`
 * in lib/api.ts), losing in-progress form state. To get ahead of that we
 * track user activity and, after a configurable idle period, show a
 * "Still there?" modal with a countdown before the session actually lapses.
 *
 * This module is pure config resolution so it can be unit-tested without a
 * DOM — the hook (hooks/useIdleSession.tsx) and modal own the behaviour.
 */

/** Idle period before the warning modal appears, when nothing is configured. */
export const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;

/**
 * How long the "Still there?" countdown runs before we treat the session as
 * lapsed and redirect. Also the lead time subtracted from the idle timeout,
 * so the warning shows with this many seconds still on the clock.
 */
export const DEFAULT_IDLE_WARNING_SECONDS = 60;

/** Lower bound on the warning window regardless of configuration. */
const MIN_WARNING_SECONDS = 10;

export interface IdleSessionConfig {
  /** When false the hook installs no listeners and the modal never shows. */
  enabled: boolean;
  /** Milliseconds of inactivity before the warning modal appears. */
  warnAfterMs: number;
  /** Milliseconds the countdown runs once the modal is shown. */
  countdownMs: number;
}

/** The environment keys this module reads (a slice of `process.env`). */
export type IdleSessionEnv = Record<string, string | undefined>;

/** Parses a positive, finite number from an env string; `null` if unusable. */
function positiveNumber(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Truthy env flag: "true", "1", or "on" (case-insensitive). */
function isTruthyFlag(raw: string | undefined): boolean {
  if (raw == null) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on";
}

/** Explicitly-false env flag: "false", "0", or "off" (case-insensitive). */
function isFalsyFlag(raw: string | undefined): boolean {
  if (raw == null) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "false" || normalized === "0" || normalized === "off";
}

/**
 * Resolves the effective idle-session config.
 *
 * - Disabled by default in development (`nodeEnv !== "production"`) so local
 *   work is never interrupted; opt in with `NEXT_PUBLIC_IDLE_SESSION_ENABLED=true`.
 * - Enabled by default outside development; opt out with the same flag set
 *   to a falsy value.
 * - The countdown always fits inside the idle timeout, so a misconfigured
 *   warning longer than the timeout is clamped rather than firing immediately.
 */
export function resolveIdleSessionConfig(
  env: IdleSessionEnv,
  nodeEnv: string | undefined = process.env.NODE_ENV
): IdleSessionConfig {
  const isDev = nodeEnv !== "production";
  const flag = env.NEXT_PUBLIC_IDLE_SESSION_ENABLED;
  const enabled = isDev
    ? isTruthyFlag(flag)
    : !isFalsyFlag(flag);

  const timeoutMinutes =
    positiveNumber(env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES) ??
    DEFAULT_IDLE_TIMEOUT_MINUTES;
  const idleMs = timeoutMinutes * 60_000;

  const warningSeconds = Math.max(
    MIN_WARNING_SECONDS,
    positiveNumber(env.NEXT_PUBLIC_IDLE_WARNING_SECONDS) ??
      DEFAULT_IDLE_WARNING_SECONDS
  );
  // The countdown can't be longer than the idle timeout itself — leave at
  // least half the window as "silent idle" before the modal appears.
  const countdownMs = Math.min(warningSeconds * 1_000, Math.floor(idleMs / 2));
  const warnAfterMs = idleMs - countdownMs;

  return { enabled, warnAfterMs, countdownMs };
}
