/**
 * SLA nudge constants and localStorage helpers.
 *
 * Keeping these in a side-effect-free lib file means they can be tested
 * independently of the hook and shared with any future notification service.
 */

// ─── Thresholds ───────────────────────────────────────────────────────────────

/**
 * How far in advance of the amber SLA threshold a nudge is fired.
 * Default: 1 hour (configurable via SLA_NUDGE_LEAD_MS at the call site).
 */
export const DEFAULT_NUDGE_LEAD_MS = 60 * 60 * 1000; // 1 hour

/**
 * Age at which a pending approval turns amber (must match the value used by
 * the SLA aging badges). Default: 4 hours.
 */
export const DEFAULT_AMBER_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Default snooze duration. */
export const DEFAULT_SNOOZE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

// ─── localStorage persistence ─────────────────────────────────────────────────

const NUDGE_SENT_KEY = "delego_sla_nudge_sent";
const SNOOZE_KEY = "delego_sla_nudge_snooze";

type NudgeSentStore = Record<string, number>; // approvalId -> sentAt epoch ms
type SnoozeStore = Record<string, number>;    // approvalId -> snoozeUntil epoch ms

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or availability — best-effort.
  }
}

// ── Nudge-sent store ──────────────────────────────────────────────────────────

/** Returns true if a nudge has already been sent for this approval ID. */
export function hasNudgeBeenSent(approvalId: string): boolean {
  if (typeof window === "undefined") return false;
  const store = readJson<NudgeSentStore>(NUDGE_SENT_KEY, {});
  return approvalId in store;
}

/** Record that a nudge was sent for this approval ID. */
export function markNudgeSent(approvalId: string): void {
  if (typeof window === "undefined") return;
  const store = readJson<NudgeSentStore>(NUDGE_SENT_KEY, {});
  store[approvalId] = Date.now();
  writeJson(NUDGE_SENT_KEY, store);
}

/** Clear the nudge-sent flag (e.g., after the approval resolves). */
export function clearNudgeSent(approvalId: string): void {
  if (typeof window === "undefined") return;
  const store = readJson<NudgeSentStore>(NUDGE_SENT_KEY, {});
  delete store[approvalId];
  writeJson(NUDGE_SENT_KEY, store);
}

// ── Snooze store ──────────────────────────────────────────────────────────────

/** Returns the epoch ms until which the nudge for this approval is snoozed, or 0. */
export function getSnoozeUntil(approvalId: string): number {
  if (typeof window === "undefined") return 0;
  const store = readJson<SnoozeStore>(SNOOZE_KEY, {});
  return store[approvalId] ?? 0;
}

/** Snooze the nudge for this approval for the given duration. */
export function snoozeNudge(
  approvalId: string,
  durationMs: number = DEFAULT_SNOOZE_DURATION_MS
): void {
  if (typeof window === "undefined") return;
  const store = readJson<SnoozeStore>(SNOOZE_KEY, {});
  store[approvalId] = Date.now() + durationMs;
  writeJson(SNOOZE_KEY, store);
  // Snoozing a nudge also clears the "already sent" flag so it can fire again
  // after the snooze period.
  clearNudgeSent(approvalId);
}

/** Clear the snooze (e.g., after the approval resolves). */
export function clearSnooze(approvalId: string): void {
  if (typeof window === "undefined") return;
  const store = readJson<SnoozeStore>(SNOOZE_KEY, {});
  delete store[approvalId];
  writeJson(SNOOZE_KEY, store);
}

// ── Eligibility check ─────────────────────────────────────────────────────────

export interface NudgeEligibilityOptions {
  amberThresholdMs?: number;
  nudgeLeadMs?: number;
}

/**
 * Returns true when a nudge should be emitted for an approval that was created
 * at `createdAtMs`, given the current time `nowMs`.
 *
 * A nudge fires when:
 *   - The approval is within `nudgeLeadMs` of its amber threshold, AND
 *   - No nudge has been sent yet for this ID, AND
 *   - The approval is not currently snoozed, AND
 *   - The window is not focused (caller is responsible for the focus check to
 *     keep this function pure/testable).
 */
export function isNudgeEligible(
  approvalId: string,
  createdAtMs: number,
  nowMs: number,
  opts: NudgeEligibilityOptions = {}
): boolean {
  const amberThreshold = opts.amberThresholdMs ?? DEFAULT_AMBER_THRESHOLD_MS;
  const nudgeLead = opts.nudgeLeadMs ?? DEFAULT_NUDGE_LEAD_MS;

  const ageMs = nowMs - createdAtMs;
  const amberAt = amberThreshold;
  const nudgeAt = amberAt - nudgeLead;

  // Not yet in the nudge window.
  if (ageMs < nudgeAt) return false;
  // Already past amber — too late for a pre-amber nudge.
  if (ageMs >= amberAt) return false;

  // Deduplication: already sent.
  if (hasNudgeBeenSent(approvalId)) return false;

  // Snooze: still sleeping.
  const snoozeUntil = getSnoozeUntil(approvalId);
  if (nowMs < snoozeUntil) return false;

  return true;
}
