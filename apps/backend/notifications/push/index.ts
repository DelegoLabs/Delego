import webpush, { type PushSubscription } from "web-push";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT ?? "mailto:noreply@delego.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export type { PushSubscription };

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string }>;
}

/**
 * Stored push subscription with delivery health metadata used by the
 * cleanup job (issue #137).
 */
export interface TrackedPushSubscription {
  subscription: PushSubscription;
  /** Consecutive (or cumulative) failed delivery attempts. */
  failureCount: number;
  /** Unix ms of the last failed delivery, if any. */
  lastFailedAt?: number;
  /** Unix ms when the subscription was first saved. */
  createdAt: number;
}

/** Result of scanning and removing expired/failing push subscriptions. */
export interface PushSubscriptionCleanupResult {
  scanned: number;
  removed: number;
  failed: number;
}

/** Remove after this many failed deliveries. Override via env. */
export function getMaxPushFailures(): number {
  return Number(process.env.PUSH_MAX_FAILURES ?? "5");
}

/** Remove when last activity is older than this many ms. Override via env. */
export function getPushStaleMs(): number {
  return Number(process.env.PUSH_STALE_MS ?? String(90 * 24 * 60 * 60 * 1000));
}

/** @deprecated Prefer getMaxPushFailures() — kept for callers expecting a constant. */
export const MAX_PUSH_FAILURES = 5;

/** @deprecated Prefer getPushStaleMs() — kept for callers expecting a constant. */
export const PUSH_STALE_MS = 90 * 24 * 60 * 60 * 1000;

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error("VAPID keys are not configured");
  }
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}

/**
 * Normalize a Redis set member into a tracked subscription.
 * Supports legacy bare `PushSubscription` JSON and the tracked envelope.
 */
export function parseTrackedPushSubscription(
  raw: string,
  now = Date.now()
): TrackedPushSubscription {
  const parsed = JSON.parse(raw) as
    | TrackedPushSubscription
    | PushSubscription;

  if (
    parsed &&
    typeof parsed === "object" &&
    "subscription" in parsed &&
    parsed.subscription &&
    typeof (parsed as TrackedPushSubscription).failureCount === "number"
  ) {
    const tracked = parsed as TrackedPushSubscription;
    return {
      subscription: tracked.subscription,
      failureCount: tracked.failureCount,
      lastFailedAt: tracked.lastFailedAt,
      createdAt: tracked.createdAt ?? now,
    };
  }

  return {
    subscription: parsed as PushSubscription,
    failureCount: 0,
    createdAt: now,
  };
}

export function serializeTrackedPushSubscription(
  tracked: TrackedPushSubscription
): string {
  return JSON.stringify(tracked);
}

/** Record a failed delivery on a tracked subscription (immutable update). */
export function recordPushDeliveryFailure(
  tracked: TrackedPushSubscription,
  now = Date.now()
): TrackedPushSubscription {
  return {
    ...tracked,
    failureCount: tracked.failureCount + 1,
    lastFailedAt: now,
  };
}

/** Reset failure count after a successful delivery. */
export function recordPushDeliverySuccess(
  tracked: TrackedPushSubscription
): TrackedPushSubscription {
  if (tracked.failureCount === 0 && tracked.lastFailedAt === undefined) {
    return tracked;
  }
  return {
    ...tracked,
    failureCount: 0,
    lastFailedAt: undefined,
  };
}

/**
 * Returns true when a subscription should be removed by cleanup rules:
 * - failureCount >= MAX_PUSH_FAILURES, or
 * - last activity (lastFailedAt or createdAt) is older than PUSH_STALE_MS
 */
export function shouldRemovePushSubscription(
  tracked: TrackedPushSubscription,
  now = Date.now()
): boolean {
  if (tracked.failureCount >= getMaxPushFailures()) {
    return true;
  }
  const anchor = tracked.lastFailedAt ?? tracked.createdAt;
  return now - anchor >= getPushStaleMs();
}

/**
 * Remove expired or repeatedly failing push subscriptions from a list.
 *
 * Pure function for unit tests and for callers that own Redis persistence.
 * `failed` counts members that could not be evaluated (malformed input).
 */
export function cleanupPushSubscriptions(
  subscriptions: TrackedPushSubscription[],
  now = Date.now()
): {
  result: PushSubscriptionCleanupResult;
  retained: TrackedPushSubscription[];
  removed: TrackedPushSubscription[];
} {
  const retained: TrackedPushSubscription[] = [];
  const removed: TrackedPushSubscription[] = [];
  let failed = 0;

  for (const tracked of subscriptions) {
    try {
      if (
        !tracked?.subscription?.endpoint ||
        typeof tracked.failureCount !== "number" ||
        typeof tracked.createdAt !== "number"
      ) {
        failed += 1;
        removed.push(tracked);
        continue;
      }
      if (shouldRemovePushSubscription(tracked, now)) {
        removed.push(tracked);
      } else {
        retained.push(tracked);
      }
    } catch {
      failed += 1;
    }
  }

  return {
    result: {
      scanned: subscriptions.length,
      removed: removed.length,
      failed,
    },
    retained,
    removed,
  };
}
