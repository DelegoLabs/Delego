"use client";

import { useEffect, useRef, useState } from "react";
import { env } from "../lib/env";

export interface AgentLiveStatus {
  agentId: string;
  state: "idle" | "searching" | "negotiating" | "awaiting_approval" | "executing";
  currentTaskDescription?: string;
  activeOrderId?: string;
}

function wsUrlFromApiUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/ws/agent-status`;
  return url.toString();
}

const MAX_RECONNECT_DELAY_MS = 15_000;

/**
 * Subscribes to the live agent-status WebSocket stream and returns the
 * latest `AgentLiveStatus`, or `null` before the first message / while
 * disconnected. Reconnects with exponential backoff on close/error.
 */
export function useAgentLiveStatus(enabled: boolean): AgentLiveStatus | null {
  const [status, setStatus] = useState<AgentLiveStatus | null>(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      try {
        socket = new WebSocket(wsUrlFromApiUrl(env.NEXT_PUBLIC_API_URL));
      } catch {
        scheduleReconnect();
        return;
      }

      socket.addEventListener("open", () => {
        attemptRef.current = 0;
      });

      socket.addEventListener("message", (event) => {
        try {
          const parsed = JSON.parse(event.data) as AgentLiveStatus;
          if (!cancelled) setStatus(parsed);
        } catch {
          // Ignore malformed frames.
        }
      });

      socket.addEventListener("close", scheduleReconnect);
      socket.addEventListener("error", () => socket?.close());
    }

    function scheduleReconnect() {
      if (cancelled) return;
      const delay = Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** attemptRef.current);
      attemptRef.current += 1;
      reconnectTimer = setTimeout(connect, delay);
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [enabled]);

  return status;
}
