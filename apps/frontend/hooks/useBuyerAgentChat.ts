"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Handle over the live Server-Sent Events connection backing the buyer-agent
 * chat (#744).
 *
 * The chat drawer streams the agent's reply over a `fetch`-based SSE response
 * rather than `EventSource`, because `EventSource` cannot be aborted and keeps
 * the socket open after the drawer unmounts — the leak this hook fixes.
 */
export interface SseStreamController {
  /** Terminate the inflight HTTP stream immediately. Safe to call repeatedly. */
  abort(): void;
  /** True while a stream is open and has not been aborted or finished. */
  isConnected: boolean;
  /** Id of the agent message currently being streamed, if any. */
  activeMessageId: string | null;
}

export interface UseBuyerAgentChatOptions {
  /** Base URL of the chat endpoint. Defaults to a relative `/api/agent/chat`. */
  endpoint?: string;
  /** Called with each parsed SSE frame's data payload. */
  onMessage?: (data: string) => void;
  /** Called once the stream terminates for any reason. */
  onClose?: () => void;
}

export interface UseBuyerAgentChatResult extends SseStreamController {
  /** True while a stream is open. Mirrors `isConnected` for render use. */
  isStreaming: boolean;
  /** Open a stream for `prompt`, aborting any stream already in flight. */
  send: (prompt: string, messageId?: string) => Promise<void>;
}

/**
 * Owns the buyer-agent chat SSE stream.
 *
 * The connection is created with an `AbortController` whose signal is bound to
 * the `fetch` call, so closing the drawer (unmounting the hook) tears the
 * inflight HTTP stream down immediately instead of letting it drain in the
 * background. Every state write is gated on the signal so an aborted stream
 * can never update an unmounted component.
 */
export function useBuyerAgentChat(
  options: UseBuyerAgentChatOptions = {}
): UseBuyerAgentChatResult {
  const { endpoint = "/api/agent/chat", onMessage, onClose } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const onMessageRef = useRef(onMessage);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (mountedRef.current) {
      setIsConnected(false);
      setActiveMessageId(null);
    }
  }, []);

  const send = useCallback(
    async (prompt: string, messageId?: string) => {
      // A new prompt supersedes any stream still in flight.
      controllerRef.current?.abort();

      const controller = new AbortController();
      controllerRef.current = controller;

      setIsConnected(true);
      setActiveMessageId(messageId ?? null);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        });

        if (!response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (controller.signal.aborted) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line.
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (data) onMessageRef.current?.(data);
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch {
        // An abort is the expected path when the drawer closes; any other
        // stream error is swallowed so it never throws into the render tree.
        // Consumers observe termination through `onClose`.
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        if (mountedRef.current && !controller.signal.aborted) {
          setIsConnected(false);
          setActiveMessageId(null);
        }
        onCloseRef.current?.();
      }
    },
    [endpoint]
  );

  // Tear the inflight stream down when the drawer unmounts. This is the fix
  // for #744: without it the SSE response keeps streaming into a dead tree.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  return {
    abort,
    isConnected,
    activeMessageId,
    isStreaming: isConnected,
    send,
  };
}
