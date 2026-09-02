"use client";

import { useCallback, useEffect } from "react";
import type { Order } from "@delego/types";
import { useNotifications } from "./useNotifications";
import {
  DEFAULT_AMBER_THRESHOLD_MS,
  DEFAULT_NUDGE_LEAD_MS,
  DEFAULT_SNOOZE_DURATION_MS,
  isNudgeEligible,
  markNudgeSent,
  snoozeNudge,
  clearNudgeSent,
  clearSnooze,
} from "../lib/slaNudge";

// ─── OS Notifications (thin wrapper — wire to real API when available) ────────

/**
 * Best-effort OS notification. Requests permission on first call and silently
 * degrades when the Notifications API is absent or denied.
 */
function emitOsNotification(title: string, body: string): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "denied") return;

  const fire = () =>
    new Notification(title, { body, icon: "/favicon.ico", tag: title });

  if (Notification.permission === "granted") {
    fire();
  } else {
    Notification.requestPermission().then((p) => {
      if (p === "granted") fire();
    });
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseSLANudgeOptions {
  /**
   * Age (ms) at which an approval turns amber. Must match the badge thresholds.
   * @default DEFAULT_AMBER_THRESHOLD_MS (4 hours)
   */
  amberThresholdMs?: number;
  /**
   * How far before amber the nudge should fire.
   * @default DEFAULT_NUDGE_LEAD_MS (1 hour)
   */
  nudgeLeadMs?: number;
  /**
   * How often (ms) the hook re-checks all pending approvals.
   * @default 60_000 (1 minute)
   */
  pollIntervalMs?: number;
  /**
   * Duration (ms) to snooze a nudge when the user clicks "Snooze".
   * @default DEFAULT_SNOOZE_DURATION_MS (2 hours)
   */
  snoozeDurationMs?: number;
}

export interface UseSLANudgeResult {
  /**
   * Snooze the nudge for a specific approval ID for `snoozeDurationMs`.
   * Persisted to localStorage so it survives page reloads.
   */
  snooze: (approvalId: string) => void;
}

/**
 * Monitors pending approvals and emits a proactive reminder nudge once per
 * approval as it approaches the SLA amber threshold.
 *
 * Deduplication guarantees:
 *   - Max one nudge per approval (localStorage-backed, survives reloads).
 *   - Snooze is honoured across reloads.
 *   - Notifications are suppressed while `document.hasFocus()` is true
 *     (the user is already on the approvals tab).
 */
export function useSLANudge(
  pendingApprovals: Order[],
  opts: UseSLANudgeOptions = {}
): UseSLANudgeResult {
  const {
    amberThresholdMs = DEFAULT_AMBER_THRESHOLD_MS,
    nudgeLeadMs = DEFAULT_NUDGE_LEAD_MS,
    pollIntervalMs = 60_000,
    snoozeDurationMs = DEFAULT_SNOOZE_DURATION_MS,
  } = opts;

  const { add: addInAppNotification } = useNotifications();

  const checkAndNudge = useCallback(() => {
    // Focus suppression: don't interrupt while the user is already looking.
    if (typeof document !== "undefined" && document.hasFocus()) return;

    const now = Date.now();
    for (const approval of pendingApprovals) {
      const eligible = isNudgeEligible(
        approval.id,
        approval.createdAt.getTime(),
        now,
        { amberThresholdMs, nudgeLeadMs }
      );
      if (!eligible) continue;

      // Mark sent *before* emitting so a re-render race can't double-fire.
      markNudgeSent(approval.id);

      const title = `Approval #${approval.id} needs your attention`;
      const message = `This request is approaching its SLA deadline. Review it now to avoid delays.`;

      // In-app channel.
      addInAppNotification({
        type: "warning",
        title,
        message,
        href: `/approvals`,
      });

      // OS notification channel.
      emitOsNotification(title, message);
    }
  }, [pendingApprovals, amberThresholdMs, nudgeLeadMs, addInAppNotification]);

  // Run on mount and on every poll tick.
  useEffect(() => {
    checkAndNudge();
    const timer = setInterval(checkAndNudge, pollIntervalMs);
    return () => clearInterval(timer);
  }, [checkAndNudge, pollIntervalMs]);

  // Clean up stale nudge/snooze records for approvals that are no longer pending.
  useEffect(() => {
    // We can only clean up ids we know about. This is best-effort.
    return () => {
      // No-op on mount; cleanup happens when the component using this hook
      // receives a resolved approval and removes it from pendingApprovals —
      // at that point the entry simply stops being checked.
    };
  }, []);

  const snooze = useCallback(
    (approvalId: string) => {
      snoozeNudge(approvalId, snoozeDurationMs);
    },
    [snoozeDurationMs]
  );

  return { snooze };
}

// Re-export cleanup helpers for consumers that want to clear state when an
// approval resolves (e.g., the approvals page can call these on approve/reject).
export { clearNudgeSent, clearSnooze };
