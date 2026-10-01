"use client";

import { useEffect, useRef, useState } from "react";

import {
  completedAgentMessageIds,
  type BuyerAgentMessage,
} from "../lib/buyerAgentMessages";
import { useAudioNotifications } from "./useAudioNotifications";

/**
 * Live-chat audio ping for incoming buyer-agent messages (#811).
 *
 * A live chat re-renders its whole transcript as the agent streams, so the
 * completion signal is derived from the transcript rather than from a single
 * callback: an agent message that flips from `pending: true` to complete is
 * the moment a chime should fire — whether it is prose, a proposal card, or
 * both.
 *
 * Deliberately ping **once** per render pass, even when several messages land
 * together. A burst of overlapping chimes is exactly the "intrusive" failure
 * mode #811 asks to avoid.
 *
 * Usage from a live chat view, where the transcript is re-rendered as the agent
 * streams:
 *
 * ```tsx
 * const messages = useLiveTranscript(conversationId);
 * useBuyerAgentMessagePing(messages);
 * ```
 */
export interface BuyerAgentMessagePingOptions {
  /** Set false to silence the ping without changing the user's preference. Default: true. */
  enabled?: boolean;
  /** Fired after a chime that actually played — handy for tests and analytics. */
  onPing?: (messageId: string) => void;
}

export interface BuyerAgentMessagePingResult {
  /** Id of the most recent agent message that triggered a chime. */
  lastPingedMessageId: string | null;
  /** How many chimes this hook instance has played. */
  pingCount: number;
}

/**
 * Plays the chime once when a new completed buyer-agent message lands in
 * `messages`.
 *
 * Requires an AudioNotificationsProvider (see
 * hooks/useAudioNotifications.tsx), which owns the user's preference, the
 * volume, and the reduced-motion / autoplay gates.
 *
 * Messages already present on mount are treated as transcript history and are
 * never announced — reopening a conversation must not machine-gun chimes.
 */
export function useBuyerAgentMessagePing(
  messages: readonly BuyerAgentMessage[],
  { enabled = true, onPing }: BuyerAgentMessagePingOptions = {}
): BuyerAgentMessagePingResult {
  const { playChime } = useAudioNotifications();
  const [lastPingedMessageId, setLastPingedMessageId] = useState<string | null>(
    null
  );
  const [pingCount, setPingCount] = useState(0);

  /** Ids already accounted for, so each message pings at most once per mount. */
  const seenRef = useRef<Set<string> | null>(null);
  const onPingRef = useRef(onPing);

  useEffect(() => {
    onPingRef.current = onPing;
  }, [onPing]);

  useEffect(() => {
    const ids = completedAgentMessageIds(messages);

    // First pass after mount: adopt whatever is already on screen as history.
    if (seenRef.current === null) {
      seenRef.current = new Set(ids);
      return;
    }

    const fresh = ids.filter((id) => !seenRef.current!.has(id));
    if (fresh.length === 0) return;

    // Record them before playing so a render triggered by the chime itself
    // can't re-announce the same message.
    for (const id of fresh) seenRef.current.add(id);

    if (!enabled) return;
    if (!playChime()) return;

    const newest = fresh[fresh.length - 1];
    setLastPingedMessageId(newest);
    setPingCount((count) => count + 1);
    onPingRef.current?.(newest);
  }, [enabled, messages, playChime]);

  return { lastPingedMessageId, pingCount };
}
