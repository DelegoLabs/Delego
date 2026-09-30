"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestNotification,
  type PushSubscriptionPayload,
} from "../lib/webPush";
import { env } from "../lib/env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebPushStatus =
  /** Browser doesn't support the Push API or no VAPID key is configured. */
  | "unsupported"
  /** Push is supported but the user hasn't opted in yet. */
  | "idle"
  /** Waiting for the browser's permission prompt to resolve. */
  | "requesting"
  /** Subscribed — push notifications are active. */
  | "subscribed"
  /** User denied the permission prompt. */
  | "denied"
  /** A subscribe/unsubscribe network call is in progress. */
  | "loading"
  /** The last subscribe/unsubscribe attempt failed. */
  | "error";

export interface UseWebPushResult {
  /** Whether Web Push is available in this browser and a VAPID key is set. */
  supported: boolean;
  /** Current lifecycle state of the push subscription. */
  status: WebPushStatus;
  /** The last serialised subscription payload, or `null` when not subscribed. */
  subscription: PushSubscriptionPayload | null;
  /** Human-readable error message when `status === "error"`. */
  error: string | null;
  /**
   * Request browser notification permission and subscribe to push.
   * Triggers the permission prompt on the first call.
   *
   * @param orderIds - Order IDs to track. Empty array = all orders.
   */
  subscribe: (orderIds?: string[]) => Promise<void>;
  /** Unsubscribe and remove the server-side record. */
  unsubscribe: () => Promise<void>;
  /**
   * Display a test push notification to verify the pipeline works.
   * Requires an active subscription.
   */
  sendTest: () => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manage the Web Push subscription lifecycle for order shipment & delivery
 * status alerts.
 *
 * The hook is deliberately decoupled from `useOsNotifications` because push
 * subscriptions survive tab closes and are backed by the service worker,
 * whereas OS notifications (via the Notification API) are foreground-only.
 */
export function useWebPush(): UseWebPushResult {
  const vapidKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const supported = isPushSupported() && Boolean(vapidKey);

  const [status, setStatus] = useState<WebPushStatus>(
    supported ? "idle" : "unsupported"
  );
  const [subscription, setSubscription] =
    useState<PushSubscriptionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // On mount: check whether the browser already has an active subscription
  // (e.g. page was reloaded after opting in).
  useEffect(() => {
    if (!supported) return;

    let cancelled = false;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (cancelled) return;

        if (existing) {
          // Re-hydrate the status from the browser's PushManager state so
          // the UI reflects reality without requiring a round-trip to the
          // server. We can't recover the `orderIds` array here (the browser
          // doesn't store them), so we use an empty array as a sentinel that
          // the user is subscribed to global updates.
          const rawKey = existing.getKey("p256dh");
          const rawAuth = existing.getKey("auth");
          if (rawKey && rawAuth) {
            const toBase64Url = (buf: ArrayBuffer) => {
              const bytes = new Uint8Array(buf);
              let bin = "";
              for (let i = 0; i < bytes.byteLength; i++) {
                bin += String.fromCharCode(bytes[i]);
              }
              return btoa(bin)
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "");
            };
            setSubscription({
              endpoint: existing.endpoint,
              keys: {
                p256dh: toBase64Url(rawKey),
                auth: toBase64Url(rawAuth),
              },
              orderIds: [],
            });
            setStatus("subscribed");
          }
        } else {
          // Check permission state in case the user denied mid-session.
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "denied"
          ) {
            setStatus("denied");
          } else {
            setStatus("idle");
          }
        }
      } catch {
        // Non-fatal — if we can't read the subscription state, just stay idle.
        if (!cancelled) setStatus("idle");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supported]);

  const subscribe = useCallback(
    async (orderIds: string[] = []) => {
      if (!supported) return;
      setError(null);
      setStatus("requesting");

      try {
        // The browser will show its permission dialog inside subscribeToPush
        // (via PushManager.subscribe) if the permission hasn't been granted yet.
        const payload = await subscribeToPush(orderIds);

        if (payload === null) {
          // Permission was denied or demo mode is active.
          const perm =
            typeof Notification !== "undefined"
              ? Notification.permission
              : "default";
          setStatus(perm === "denied" ? "denied" : "idle");
          return;
        }

        setSubscription(payload);
        setStatus("subscribed");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to enable push notifications.";
        setError(message);
        setStatus("error");
      }
    },
    [supported]
  );

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setError(null);
    setStatus("loading");

    try {
      await unsubscribeFromPush();
      setSubscription(null);
      setStatus("idle");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to disable push notifications.";
      setError(message);
      setStatus("error");
    }
  }, [supported]);

  const sendTest = useCallback(async (): Promise<boolean> => {
    return sendTestNotification();
  }, []);

  return {
    supported,
    status,
    subscription,
    error,
    subscribe,
    unsubscribe,
    sendTest,
  };
}
