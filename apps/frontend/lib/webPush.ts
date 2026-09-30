import { env } from "./env";
import { createRetryingFetch } from "./api";
import { isDemoMode } from "./demoMode";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Order IDs the subscription should receive push events for. */
  orderIds: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const retryingFetch = createRetryingFetch();

/** Convert an ArrayBuffer to a base64url string (no padding). */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Convert a base64url-encoded VAPID public key to the Uint8Array that
 * `PushManager.subscribe` expects as `applicationServerKey`.
 */
export function vapidPublicKeyToUint8Array(base64UrlKey: string): Uint8Array {
  const padding = (4 - (base64UrlKey.length % 4)) % 4;
  const base64 = base64UrlKey.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padding);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert a browser `PushSubscription` to the `PushSubscriptionPayload`
 * shape expected by the API.
 */
function serializeSubscription(
  subscription: PushSubscription,
  orderIds: string[]
): PushSubscriptionPayload {
  const rawKey = subscription.getKey("p256dh");
  const rawAuth = subscription.getKey("auth");

  if (!rawKey || !rawAuth) {
    throw new Error("PushSubscription is missing required keys (p256dh / auth).");
  }

  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: arrayBufferToBase64Url(rawKey),
      auth: arrayBufferToBase64Url(rawAuth),
    },
    orderIds,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** True when both the Push API and Service Worker API are present. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/**
 * Subscribe the current browser to Web Push notifications for the given
 * order IDs. Registers the subscription with the backend.
 *
 * Returns the serialised `PushSubscriptionPayload` on success, or `null`
 * if permission was denied or if this is running in demo mode.
 *
 * @param orderIds - The order IDs to track. Pass an empty array to subscribe
 *   globally (all of the user's orders).
 */
export async function subscribeToPush(
  orderIds: string[] = []
): Promise<PushSubscriptionPayload | null> {
  if (!isPushSupported()) return null;
  if (isDemoMode()) return null;

  const vapidKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    throw new Error(
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set. " +
        "Add it to .env.local before using Web Push."
    );
  }

  const registration = await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidPublicKeyToUint8Array(vapidKey),
  });

  const payload = serializeSubscription(subscription, orderIds);

  const res = await retryingFetch(
    `${env.NEXT_PUBLIC_API_URL}/push-subscriptions`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    // Unsubscribe so the browser isn't left with a dangling subscription
    // that the server doesn't know about.
    await subscription.unsubscribe();
    const body = await res.json().catch(() => null);
    throw new Error(
      body?.message ?? `Failed to register push subscription (${res.status}).`
    );
  }

  return payload;
}

/**
 * Unsubscribe the current browser from Web Push notifications and remove the
 * subscription from the backend.
 *
 * Returns `true` if a subscription was found and removed, `false` if there
 * was nothing to remove.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) return false;

  // Tell the server first so it can clean up its record; if the network call
  // fails we still want to remove the local subscription.
  try {
    await retryingFetch(
      `${env.NEXT_PUBLIC_API_URL}/push-subscriptions`,
      {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }
    );
  } catch {
    // Best-effort server-side cleanup — proceed with local unsubscription.
  }

  await subscription.unsubscribe();
  return true;
}

/**
 * Ask the service worker to display a test notification immediately.
 * This confirms the push pipeline is working end-to-end in the current
 * browser without waiting for a real shipment event from the server.
 *
 * Returns `true` if the notification was dispatched, `false` if the
 * browser is not subscribed or the permission is not granted.
 */
export async function sendTestNotification(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  await registration.showNotification("Delego — push is working 🎉", {
    body: "Your package status alerts are active. You'll hear from us when there's an update.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: "delego-push-test",
  });

  return true;
}
