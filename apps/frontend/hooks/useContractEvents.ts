"use client";

import { useEffect, useRef, useState } from "react";
import { env } from "../lib/env";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ContractEventFilter {
  contractAddress: string;
  topics: Array<string | symbol>;
  fromLedger?: number;
}

export interface ContractEvent {
  contractAddress: string;
  topics: string[];
  data: unknown;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Serialises a filter into a stable string key so two filters with identical
 * properties (regardless of object identity) produce the same key.
 *
 * `symbol` topics are converted to their description so they survive the
 * JSON round-trip; if two different symbols share a description they hash
 * to the same key, which is an acceptable trade-off for this use-case.
 */
function filterKey(filter: ContractEventFilter): string {
  const topics = filter.topics.map((t) =>
    typeof t === "symbol" ? `symbol:${t.description ?? ""}` : t
  );
  // Sort object keys for a stable serialisation independent of property order.
  return JSON.stringify({
    contractAddress: filter.contractAddress,
    fromLedger: filter.fromLedger ?? null,
    topics,
  });
}

/**
 * A `useRef`-backed deep-comparison memo that returns the *same object
 * reference* as long as the serialised form of `value` doesn't change.
 *
 * This keeps `useEffect` dependency arrays stable when callers pass inline
 * filter object literals, eliminating spurious re-subscriptions without
 * requiring an external library.
 */
function useStableFilter(filter: ContractEventFilter): ContractEventFilter {
  const ref = useRef<{ key: string; value: ContractEventFilter } | null>(null);
  const key = filterKey(filter);
  if (ref.current === null || ref.current.key !== key) {
    ref.current = { key, value: filter };
  }
  return ref.current.value;
}

function wsUrlFromApiUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/ws/contract-events`;
  return url.toString();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseContractEventsResult {
  events: ContractEvent[];
  connected: boolean;
  error: string | null;
}

const MAX_RECONNECT_DELAY_MS = 15_000;
/** Trim the local event buffer to avoid unbounded memory growth. */
const MAX_BUFFERED_EVENTS = 200;

/**
 * Subscribes to the Soroban RPC contract-events WebSocket stream for a given
 * `filter`. Returns the accumulated events received since mount (or since the
 * filter last changed), plus connection state.
 *
 * **Subscription stability** — the hook uses a stable-reference deep-compare
 * on `filter` so that callers who pass inline object literals (e.g.
 * `useContractEvents({ contractAddress: "C…", topics: ["transfer"] })`) do
 * NOT trigger a re-subscription on every parent render. Only a genuine change
 * to the filter's *properties* causes the WebSocket to be torn down and
 * reconnected.
 *
 * **Cleanup** — the current WebSocket channel is always closed (and any
 * pending reconnect timer cancelled) before a new connection is opened and
 * when the hook unmounts.
 */
export function useContractEvents(
  filter: ContractEventFilter
): UseContractEventsResult {
  // Stabilise the filter reference so the useEffect dependency only changes
  // when the filter content genuinely changes, not on every render.
  const stableFilter = useStableFilter(filter);

  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attemptRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    // Reset accumulated state whenever the filter genuinely changes.
    setEvents([]);
    setError(null);
    setConnected(false);

    function connect() {
      if (cancelled) return;

      try {
        socket = new WebSocket(wsUrlFromApiUrl(env.NEXT_PUBLIC_API_URL));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to open WebSocket");
        scheduleReconnect();
        return;
      }

      socket.addEventListener("open", () => {
        if (cancelled) {
          socket?.close();
          return;
        }
        attemptRef.current = 0;
        setConnected(true);
        setError(null);

        // Send the subscription request immediately after the channel opens.
        socket?.send(
          JSON.stringify({
            type: "subscribe_contract_events",
            contractAddress: stableFilter.contractAddress,
            topics: stableFilter.topics.map((t) =>
              typeof t === "symbol" ? t.description ?? "" : t
            ),
            ...(stableFilter.fromLedger !== undefined && {
              fromLedger: stableFilter.fromLedger,
            }),
          })
        );
      });

      socket.addEventListener("message", (event) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(event.data as string) as ContractEvent;
          setEvents((prev) => {
            const next = [...prev, parsed];
            return next.length > MAX_BUFFERED_EVENTS
              ? next.slice(next.length - MAX_BUFFERED_EVENTS)
              : next;
          });
        } catch {
          // Ignore malformed frames.
        }
      });

      socket.addEventListener("close", () => {
        if (cancelled) return;
        setConnected(false);
        scheduleReconnect();
      });

      socket.addEventListener("error", () => {
        setError("WebSocket error");
        socket?.close();
      });
    }

    function scheduleReconnect() {
      if (cancelled) return;
      const delay = Math.min(
        MAX_RECONNECT_DELAY_MS,
        500 * 2 ** attemptRef.current
      );
      attemptRef.current += 1;
      reconnectTimer = setTimeout(connect, delay);
    }

    connect();

    return () => {
      // Mark cancelled *first* so any in-flight async callbacks are no-ops,
      // then close the socket and cancel any pending reconnect timer.
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
    // stableFilter is the only real dependency — it only changes when the
    // filter content changes, not on every render.
  }, [stableFilter]);

  return { events, connected, error };
}
