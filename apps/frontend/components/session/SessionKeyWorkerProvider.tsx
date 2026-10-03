"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import {
  clearSessionKey,
  getSessionKeyWorker,
  initSessionKeyWorker,
} from "../../lib/session/sessionKeyClient";
import type { SessionKeyWorkerMessage } from "../../workers/sessionKeyWorker";

export interface SessionKeyWorkerContextValue {
  /** The shared worker, or null when none has been created yet. */
  worker: Worker | null;
  /** Creates the worker on demand and returns it. */
  ensureWorker: () => Worker;
  /** Sends a message to the shared worker. */
  post: (message: SessionKeyWorkerMessage) => void;
  /** Wipes and tears down the worker. */
  clear: () => Promise<void>;
}

const SessionKeyWorkerContext = createContext<SessionKeyWorkerContextValue | null>(null);

/**
 * Makes the session-signing-key worker reachable from anywhere in the app
 * shell. The worker is created lazily so pages that never grant a session key
 * never pay for it.
 */
export function SessionKeyWorkerProvider({ children }: { children: ReactNode }) {
  const ensureWorker = useCallback(() => initSessionKeyWorker(), []);
  const post = useCallback((message: SessionKeyWorkerMessage) => {
    initSessionKeyWorker().postMessage(message);
  }, []);
  const clear = useCallback(() => clearSessionKey(), []);

  const value = useMemo<SessionKeyWorkerContextValue>(
    () => ({ worker: getSessionKeyWorker(), ensureWorker, post, clear }),
    [ensureWorker, post, clear],
  );

  return (
    <SessionKeyWorkerContext.Provider value={value}>
      {children}
    </SessionKeyWorkerContext.Provider>
  );
}

/**
 * Access the session-key worker. Returns null context outside the provider so
 * a component can degrade gracefully instead of throwing.
 */
export function useSessionKeyWorker(): SessionKeyWorkerContextValue | null {
  return useContext(SessionKeyWorkerContext);
}

export default SessionKeyWorkerProvider;
