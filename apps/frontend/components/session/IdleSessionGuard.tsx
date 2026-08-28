"use client";

import { useIdleSession } from "../../hooks/useIdleSession";
import { IdleSessionModal } from "./IdleSessionModal";

/**
 * App-shell mount point for the idle-session keep-alive (#514). Renders
 * nothing until the user has been idle long enough to warrant the
 * "Still there?" prompt; the watcher self-disables when config says so
 * (off in dev unless `NEXT_PUBLIC_IDLE_SESSION_ENABLED=true`).
 */
export function IdleSessionGuard() {
  const { warning, secondsLeft, stayActive } = useIdleSession();
  return (
    <IdleSessionModal
      open={warning}
      secondsLeft={secondsLeft}
      onStay={stayActive}
    />
  );
}
