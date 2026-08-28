"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  resolveIdleSessionConfig,
  type IdleSessionConfig,
} from "../lib/idleSession";
import {
  loginRedirectUrl,
  markSessionInterrupted,
  pingSession,
} from "../lib/session";

/** Pointer/key/scroll events that count as "the user is still here". */
const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "scroll",
  "wheel",
  "touchstart",
] as const;

/** Ignore repeat activity within this window so listeners stay cheap (#514). */
const ACTIVITY_THROTTLE_MS = 1_000;

export interface UseIdleSessionOptions {
  /**
   * Pre-resolved config. Defaults to `resolveIdleSessionConfig(env)` — pass
   * an explicit value in tests to avoid depending on `NODE_ENV`.
   */
  config?: IdleSessionConfig;
  /**
   * Called when the countdown lapses or the keep-alive ping fails. Defaults
   * to a hard redirect to `/login?next=…`. Overridable for tests.
   */
  onExpire?: (redirectUrl: string) => void;
  /** Keep-alive ping. Defaults to `lib/session.pingSession`. */
  ping?: () => Promise<boolean>;
}

export interface UseIdleSessionResult {
  /** Whether the "Still there?" modal should be shown. */
  warning: boolean;
  /** Whole seconds remaining on the countdown; 0 once it has lapsed. */
  secondsLeft: number;
  /** Confirm presence: pings the session, then resumes or expires. */
  stayActive: () => void;
  /** Whether the idle watcher is actually running (config-gated). */
  enabled: boolean;
}

function defaultExpire(redirectUrl: string): void {
  if (typeof window !== "undefined") {
    window.location.href = redirectUrl;
  }
}

/**
 * Watches for user inactivity and, `config.warnAfterMs` after the last
 * interaction, surfaces a warning with a `config.countdownMs` countdown.
 * Confirming pings a cheap endpoint to refresh the session; letting the
 * countdown run out (or a failed ping) redirects to `/login?next=…` so
 * in-progress form drafts can be restored on return (see lib/formDraft.ts).
 */
export function useIdleSession(
  options: UseIdleSessionOptions = {}
): UseIdleSessionResult {
  const {
    // Read straight from `process.env` (the only keys touched are the three
    // optional `NEXT_PUBLIC_IDLE_*` ones) rather than `lib/env`, so mounting
    // the guard never forces the caller to stub the whole env schema.
    config = resolveIdleSessionConfig(process.env),
    onExpire = defaultExpire,
    ping = pingSession,
  } = options;

  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<number>(0);
  const lastActivityRef = useRef<number>(0);
  // Latest callbacks/state kept in refs so the mount effect can stay stable.
  const onExpireRef = useRef(onExpire);
  const pingRef = useRef(ping);
  const warningRef = useRef(false);
  onExpireRef.current = onExpire;
  pingRef.current = ping;
  warningRef.current = warning;

  const clearTimers = useCallback(() => {
    if (warnTimerRef.current !== null) {
      clearTimeout(warnTimerRef.current);
      warnTimerRef.current = null;
    }
    if (tickTimerRef.current !== null) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const expire = useCallback(() => {
    clearTimers();
    markSessionInterrupted();
    const url =
      typeof window !== "undefined" ? window.location.href : "http://localhost/";
    onExpireRef.current(loginRedirectUrl(url));
  }, [clearTimers]);

  const startWarnTimer = useCallback(() => {
    if (warnTimerRef.current !== null) clearTimeout(warnTimerRef.current);
    warnTimerRef.current = setTimeout(() => {
      warnTimerRef.current = null;
      deadlineRef.current = Date.now() + config.countdownMs;
      setSecondsLeft(Math.ceil(config.countdownMs / 1_000));
      setWarning(true);
      warningRef.current = true;
      tickTimerRef.current = setInterval(() => {
        const remainingMs = deadlineRef.current - Date.now();
        if (remainingMs <= 0) {
          setSecondsLeft(0);
          expire();
          return;
        }
        setSecondsLeft(Math.ceil(remainingMs / 1_000));
      }, 1_000);
    }, config.warnAfterMs);
  }, [config.countdownMs, config.warnAfterMs, expire]);

  const stayActive = useCallback(() => {
    if (!warningRef.current) return;
    if (tickTimerRef.current !== null) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    void pingRef.current().then((ok) => {
      if (ok) {
        setWarning(false);
        warningRef.current = false;
        setSecondsLeft(0);
        lastActivityRef.current = Date.now();
        startWarnTimer();
      } else {
        expire();
      }
    });
  }, [expire, startWarnTimer]);

  useEffect(() => {
    if (!config.enabled || typeof window === "undefined") return;

    lastActivityRef.current = Date.now();
    startWarnTimer();

    const handleActivity = () => {
      // Frozen while the modal is up — dismissing is an explicit choice so
      // the keep-alive ping always runs.
      if (warningRef.current) return;
      const now = Date.now();
      if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return;
      lastActivityRef.current = now;
      startWarnTimer();
    };

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, handleActivity, { passive: true });
    }

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, handleActivity);
      }
      clearTimers();
    };
  }, [config.enabled, startWarnTimer, clearTimers]);

  return { warning, secondsLeft, stayActive, enabled: config.enabled };
}
