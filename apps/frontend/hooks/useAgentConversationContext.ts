"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  deriveContext,
  EMPTY_CONTEXT,
  type AgentConversationContext,
  type ChatMessage,
} from "../lib/agentConversationContext";

export type { AgentConversationContext };

export interface UseAgentConversationContextResult {
  /** The currently derived conversation context. */
  context: AgentConversationContext;
  /**
   * Resets the inferred context back to `EMPTY_CONTEXT` without clearing the
   * chat transcript. Callers (e.g. the chat provider) are responsible for
   * passing an updated messages array that excludes any messages they want
   * removed — this hook only manages the derived state snapshot.
   *
   * In practice the UI calls `resetContext()` which bumps a version counter so
   * the next derived context starts from a clean baseline while the transcript
   * itself stays intact (per spec: "reset memory without losing chat
   * transcript").
   */
  resetContext: () => void;
  /** True while the context has been explicitly reset and the user has not
   *  sent a new message since. Lets the panel show a "Memory cleared" notice. */
  wasRecentlyReset: boolean;
}

/**
 * Derives and manages the buyer agent's inferred conversation context (#MEMORY).
 *
 * Pass the live chat messages and the hook returns:
 * - `context`          — the current inferred preferences
 * - `resetContext`     — call to wipe inferred context (without touching the transcript)
 * - `wasRecentlyReset` — true until the next user message, for UI feedback
 *
 * Usage:
 * ```tsx
 * const { context, resetContext, wasRecentlyReset } = useAgentConversationContext(messages);
 * ```
 */
export function useAgentConversationContext(
  messages: readonly ChatMessage[]
): UseAgentConversationContextResult {
  /**
   * When `resetVersion` changes we ignore the derived context and return the
   * empty baseline until the next user message arrives — this lets the
   * transcript remain intact while the active filters are cleared.
   */
  const [resetVersion, setResetVersion] = useState(0);
  /**
   * Number of user messages present at the time of the last reset. Once
   * more user messages arrive, `wasRecentlyReset` flips back to false.
   */
  const resetAtTurnRef = useRef<number | null>(null);

  const resetContext = useCallback(() => {
    const userTurns = messages.filter((m) => m.role === "user").length;
    resetAtTurnRef.current = userTurns;
    setResetVersion((v) => v + 1);
  }, [messages]);

  const context = useMemo<AgentConversationContext>(() => {
    const userTurns = messages.filter((m) => m.role === "user").length;

    // If a reset has happened and no new user message has arrived yet,
    // return the empty context so the panel immediately reflects the reset.
    if (
      resetAtTurnRef.current !== null &&
      userTurns <= resetAtTurnRef.current
    ) {
      return { ...EMPTY_CONTEXT };
    }

    // Otherwise derive normally from the full transcript.
    return deriveContext(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, resetVersion]);

  const wasRecentlyReset = useMemo(() => {
    if (resetAtTurnRef.current === null) return false;
    const userTurns = messages.filter((m) => m.role === "user").length;
    return userTurns <= resetAtTurnRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, resetVersion]);

  return { context, resetContext, wasRecentlyReset };
}
