"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Strict inactivity auto-logout timer (#1021).
 *
 * Unlike `useIdleSession` (#514), which offers a keep-alive and preserves the
 * session, this is the hard stop for unattended devices: after
 * `warningTimeoutMinutes` of no activity `onWarning` fires and a countdown
 * runs to `logoutTimeoutMinutes`, at which point `onLogout` fires exactly
 * once. Pair a 19/20 config with `IdleTimeoutModal` for the standard
 * 60-second warning.
 *
 * Idle time is measured from wall-clock timestamps rather than by trusting a
 * single long `setTimeout`, so a backgrounded tab whose timers were throttled
 * still logs out on schedule the moment it ticks again.
 */
export interface IdleTimerConfig {
  warningTimeoutMinutes: number;
  logoutTimeoutMinutes: number;
  onWarning: () => void;
  onLogout: () => void;
}

export interface UseIdleTimerOptions extends IdleTimerConfig {
  /** Turn the watcher off (e.g. while signed out). Defaults to true. */
  enabled?: boolean;
}

export interface UseIdleTimerResult {
  /** True once the warning threshold has passed and until reset/logout. */
  isWarning: boolean;
  /** Whole seconds until logout while warning; 0 otherwise. */
  secondsRemaining: number;
  /** Explicit "I'm still here" — restarts the idle clock. */
  resetTimer: () => void;
}

/** Global events that count as user activity. */
export const IDLE_ACTIVITY_EVENTS = [
  "mousemove",
  "keydown",
  "touchstart",
  "scroll",
] as const;

/** Recommended strict config: warn at 19 min, log out at 20 (60s countdown). */
export const DEFAULT_IDLE_TIMEOUTS = {
  warningTimeoutMinutes: 19,
  logoutTimeoutMinutes: 20,
} as const;

const TICK_MS = 1_000;
const MINUTE_MS = 60_000;

export function useIdleTimer({
  warningTimeoutMinutes,
  logoutTimeoutMinutes,
  onWarning,
  onLogout,
  enabled = true,
}: UseIdleTimerOptions): UseIdleTimerResult {
  const logoutMs = Math.max(0, logoutTimeoutMinutes) * MINUTE_MS;
  // A warning after the logout point would never be seen — clamp it.
  const warningMs = Math.min(
    Math.max(0, warningTimeoutMinutes) * MINUTE_MS,
    logoutMs
  );

  const [isWarning, setIsWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const lastActivityRef = useRef(0);
  const warningRef = useRef(false);
  const loggedOutRef = useRef(false);
  const onWarningRef = useRef(onWarning);
  const onLogoutRef = useRef(onLogout);
  onWarningRef.current = onWarning;
  onLogoutRef.current = onLogout;

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    loggedOutRef.current = false;
    warningRef.current = false;
    setIsWarning(false);
    setSecondsRemaining(0);
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    lastActivityRef.current = Date.now();
    loggedOutRef.current = false;

    const tick = () => {
      if (loggedOutRef.current) return;
      const idleMs = Date.now() - lastActivityRef.current;

      if (idleMs >= logoutMs) {
        loggedOutRef.current = true;
        warningRef.current = false;
        setIsWarning(false);
        setSecondsRemaining(0);
        onLogoutRef.current();
        return;
      }

      if (idleMs >= warningMs) {
        if (!warningRef.current) {
          warningRef.current = true;
          setIsWarning(true);
          onWarningRef.current();
        }
        setSecondsRemaining(Math.ceil((logoutMs - idleMs) / 1_000));
      }
    };

    const handleActivity = () => {
      // Once the warning is up only an explicit `resetTimer` (the modal's
      // "Stay signed in") extends the session — a stray mouse twitch from
      // someone walking past an unattended device must not.
      if (warningRef.current || loggedOutRef.current) return;
      lastActivityRef.current = Date.now();
    };

    for (const evt of IDLE_ACTIVITY_EVENTS) {
      // Capture so scrolls inside nested containers are seen too.
      window.addEventListener(evt, handleActivity, {
        passive: true,
        capture: true,
      });
    }
    const interval = setInterval(tick, TICK_MS);

    return () => {
      for (const evt of IDLE_ACTIVITY_EVENTS) {
        window.removeEventListener(evt, handleActivity, { capture: true });
      }
      clearInterval(interval);
    };
  }, [enabled, logoutMs, warningMs]);

  return { isWarning, secondsRemaining, resetTimer };
}
