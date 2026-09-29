"use client";

import { useEffect } from "react";
import { useIdleSession } from "../../hooks/useIdleSession";
import { IdleSessionModal } from "./IdleSessionModal";
import { clearSessionKey } from "../../lib/session/sessionKeyClient";

/**
 * App-shell mount point for the idle-session keep-alive (#514). Renders
 * nothing until the user has been idle long enough to warrant the
 * "Still there?" prompt; the watcher self-disables when config says so
 * (off in dev unless `NEXT_PUBLIC_IDLE_SESSION_ENABLED=true`).
 *
 * Also ensures the ephemeral session signing key held in the dedicated
 * Web Worker is wiped when the page is closed or hidden for the final
 * time (beforeunload / pagehide / visibilitychange), so raw key bytes
 * never persist beyond the session.
 */
export function IdleSessionGuard() {
  const { warning, secondsLeft, stayActive } = useIdleSession();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const wipeKey = () => {
      void clearSessionKey();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wipeKey();
      }
    };

    window.addEventListener("beforeunload", wipeKey);
  window.addEventListener("pagehide", wipeKey);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", wipeKey);
      window.removeEventListener("pagehide", wipeKey);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <IdleSessionModal
      open={warning}
      secondsLeft={secondsLeft}
      onStay={stayActive}
    />
  );
}
