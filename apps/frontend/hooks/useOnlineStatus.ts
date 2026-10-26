"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ConnectivityState,
  OfflineStatus as ConnectionStatus,
} from "@delegolabs/types";
import { listCachedReads } from "../lib/offlineCache";
import { subscribeToQueue } from "../lib/offlineQueue";

/** Accessible reason attached to controls disabled while offline. */
export const OFFLINE_BLOCKED_MESSAGE =
  "You're offline — reconnect to continue.";

export interface UseOnlineStatusResult {
  /** Connection status from the browser (online/offline/reconnecting). */
  connectionStatus: ConnectionStatus;
  /** Browser connectivity and the number of mutations waiting to replay. */
  connectivityState: ConnectivityState;
  /**
   * Number of orders cached for offline browsing. Populated when
   * `connectionStatus` is "offline" or "reconnecting".
   */
  cachedOrdersCount: number;
  /**
   * Timestamp of the last successful sync with the server, or null if
   * no sync has occurred or service worker is unavailable.
   */
  lastSyncedAt: Date | null;
  /**
   * Spread onto a control to disable it while offline with an accessible
   * reason (`title`), mirroring `useDemoModeGuard`'s `disabledProps`.
   */
  disabledProps:
    | { disabled: true; title: string }
    | Record<string, never>;
}

/**
 * Tracks browser connectivity via `navigator.onLine` plus the window
 * `online`/`offline` events, and surfaces what the service worker has cached
 * for offline reading (#773).
 *
 * SSR-safe: the server and the first client render both assume online
 * (`connectionStatus: "online"`) so the markup matches during hydration; the effect
 * reconciles against the real `navigator.onLine` value immediately after
 * mount — the same hydration pattern as DemoBanner/DomainWarningBanner.
 *
 * `cachedOrdersCount`/`lastSyncedAt` come straight from `lib/offlineCache.ts`
 * (a Cache Storage read, so no network round-trip) and default to 0/null
 * before the first read or in browsers without service worker support.
 */
export function useOnlineStatus(): UseOnlineStatusResult {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("online");
  const [connectivityState, setConnectivityState] = useState<ConnectivityState>({
    isOnline: true,
    queuedActionCount: 0,
    lastConnectedTimestamp: 0,
  });
  const [cachedOrdersCount, setCachedOrdersCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const previousOnline = useRef<boolean | null>(null);

  useEffect(() => {
    function update(isOnline: boolean) {
      const wasOnline = previousOnline.current;
      previousOnline.current = isOnline;
      setConnectionStatus(isOnline ? "online" : "offline");
      setConnectivityState((current) => ({
        ...current,
        isOnline,
        lastConnectedTimestamp:
          isOnline && (!current.lastConnectedTimestamp || wasOnline === false)
            ? Date.now()
            : current.lastConnectedTimestamp,
      }));
    }

    function onOnline() {
      update(true);
    }

    function onOffline() {
      update(false);
    }

    update(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(
    () =>
      subscribeToQueue((queue) => {
        const queuedActionCount = queue.filter(
          (action) =>
            action.status === "pending" || action.status === "replaying"
        ).length;
        setConnectivityState((current) =>
          current.queuedActionCount === queuedActionCount
            ? current
            : { ...current, queuedActionCount }
        );
      }),
    []
  );

  // Re-read the cache whenever connectivity flips: a reconnect populates the
  // API read cache, and a disconnect is exactly when the counts matter.
  useEffect(() => {
    let active = true;
    void listCachedReads().then((reads) => {
      if (!active) return;
      setCachedOrdersCount(reads.filter((r) => r.label === "Orders").length);
      setLastSyncedAt(
        reads.reduce<Date | null>((latest, read) => {
          if (!read.cachedAt) return latest;
          return !latest || read.cachedAt > latest ? read.cachedAt : latest;
        }, null)
      );
    });
    return () => {
      active = false;
    };
  }, [connectionStatus]);

  return useMemo(
    () => ({
      connectionStatus,
      connectivityState,
      cachedOrdersCount,
      lastSyncedAt,
      disabledProps: connectionStatus !== "online"
        ? { disabled: true as const, title: OFFLINE_BLOCKED_MESSAGE }
        : ({} as Record<string, never>),
    }),
    [connectionStatus, connectivityState, cachedOrdersCount, lastSyncedAt]
  );
}
