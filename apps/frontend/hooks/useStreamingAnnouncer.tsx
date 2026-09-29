"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { segmentSentences } from "./streamingSentences";

/**
 * Minimum time left on screen before the next queued sentence is published.
 *
 * This is the whole point of the module: a polite live region only *queues*
 * speech, so publishing faster than the screen reader can speak makes the
 * reader abandon the current utterance and restart — the "cutting off previous
 * sentences" failure. Roughly one sentence of comfortable speech.
 */
export const DEFAULT_ANNOUNCE_INTERVAL_MS = 700;

/**
 * Gap between blanking the region and publishing the next sentence into it.
 *
 * Two reasons this is not instant: screen readers ignore a live region that
 * is inserted into the DOM at the same moment its content appears, and React
 * skips the DOM write entirely when the new text is identical to the old —
 * so a repeated sentence has to go through an empty state to be spoken again.
 */
const BLANK_GAP_MS = 50;

/**
 * Cap on queued-but-unannounced sentences. Guards against a long stream
 * outpacing the reader and growing memory without bound; the oldest sentences
 * are dropped, which matches what the reader would have skipped anyway.
 */
const MAX_QUEUE = 20;

export interface StreamingAnnouncer {
  /** The one sentence currently held in the live region. `""` when idle. */
  announcement: string;
  /** True while tokens are still arriving. */
  isStreaming: boolean;
  /** Feed the next raw token from the agent stream. */
  appendToken: (token: string) => void;
  /**
   * Queue a message directly, bypassing sentence buffering. Use for discrete
   * UI events that are not part of the spoken text — a proposal card
   * appearing, a checkout action becoming available.
   */
  announceNow: (message: string) => void;
  /** Announce any trailing partial sentence and mark the stream complete. */
  flush: () => void;
  /** Discard buffered and queued text, e.g. when the user sends a new message. */
  reset: () => void;
}

/**
 * Buffers streamed agent tokens and exposes the sentences that are safe to
 * speak, one at a time and no faster than `announceIntervalMs`.
 *
 * Pair it with `<StreamingAnnouncerRegion />`. See docs/frontend-a11y.md.
 *
 * @example
 * const { announcement, appendToken, flush } = useStreamingAnnouncer();
 * for await (const token of stream) appendToken(token);
 * flush();
 */
export function useStreamingAnnouncer(
  announceIntervalMs: number = DEFAULT_ANNOUNCE_INTERVAL_MS
): StreamingAnnouncer {
  const [announcement, setAnnouncement] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Unannounced partial text at the tail of the stream.
  const bufferRef = useRef("");
  // Completed sentences waiting for their turn to be spoken.
  const queueRef = useRef<string[]>([]);
  // A sentence the region has been blanked for, awaiting publication.
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pumpRef = useRef<() => void>(() => {});

  /**
   * Publishes the next queued sentence, in two timed phases:
   *
   *   1. blank the region and arm the pending sentence;
   *   2. write the sentence, then wait an interval before repeating.
   *
   * A single timer is pending at any moment, so a stream that ends mid-cycle
   * leaves exactly one scheduled write and nothing is announced twice.
   */
  const pump = useCallback(() => {
    timerRef.current = undefined;

    if (pendingRef.current !== null) {
      const text = pendingRef.current;
      pendingRef.current = null;
      setAnnouncement(text);
      timerRef.current = setTimeout(pumpRef.current, announceIntervalMs);
      return;
    }

    const next = queueRef.current.shift();
    if (next === undefined) {
      setAnnouncement("");
      return;
    }

    setAnnouncement("");
    pendingRef.current = next;
    timerRef.current = setTimeout(pumpRef.current, BLANK_GAP_MS);
  }, [announceIntervalMs]);

  // Timers call the latest pump so the interval prop stays live without
  // re-arming the queue on every render.
  pumpRef.current = pump;

  const schedule = useCallback((delay: number) => {
    if (timerRef.current !== undefined) return;
    timerRef.current = setTimeout(pumpRef.current, delay);
  }, []);

  const enqueue = useCallback(
    (message: string) => {
      const text = message.trim();
      if (!text) return;
      queueRef.current.push(text);
      if (queueRef.current.length > MAX_QUEUE) {
        queueRef.current.splice(0, queueRef.current.length - MAX_QUEUE);
      }
      schedule(0);
    },
    [schedule]
  );

  const appendToken = useCallback(
    (token: string) => {
      if (!token) return;
      setIsStreaming(true);
      bufferRef.current += token;
      const { sentences, rest } = segmentSentences(bufferRef.current);
      // Only completed sentences are queued; the tail stays buffered so the
      // reader never hears a half-finished clause.
      bufferRef.current = rest;
      for (const sentence of sentences) enqueue(sentence);
    },
    [enqueue]
  );

  const flush = useCallback(() => {
    const tail = bufferRef.current.trim();
    bufferRef.current = "";
    setIsStreaming(false);
    if (tail) enqueue(tail);
  }, [enqueue]);

  const reset = useCallback(() => {
    bufferRef.current = "";
    queueRef.current = [];
    pendingRef.current = null;
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    setAnnouncement("");
    setIsStreaming(false);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    },
    []
  );

  return {
    announcement,
    isStreaming,
    appendToken,
    announceNow: enqueue,
    flush,
    reset,
  };
}

/**
 * The live region that {@link useStreamingAnnouncer} publishes into.
 *
 * Must be mounted empty and stay mounted: a live region inserted into the DOM
 * alongside its first content is not announced.
 *
 * `aria-atomic` is `true` and `aria-relevant` is `additions text` because the
 * region holds exactly one sentence at a time. The alternative — appending
 * every sentence to a running log with `aria-atomic="false"` — is what the
 * original issue proposed, but it only works if the reader finishes each
 * utterance before the next arrives, which cannot be guaranteed. Publishing
 * discrete, fully-spoken sentences into an atomic region is reliable across
 * NVDA, JAWS and VoiceOver.
 */
export function StreamingAnnouncerRegion({
  announcement,
}: {
  announcement: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-relevant="additions text"
      className="sr-only"
      data-testid="streaming-announcer"
    >
      {announcement}
    </div>
  );
}
