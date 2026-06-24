/**
 * Push notification sender and subscription store.
 *
 * Subscriptions that exceed the failure threshold or have not been active
 * within the staleness window are removed automatically via
 * cleanupPushSubscriptions().
 *
 * Cleanup rules are tunable via environment variables:
 *   PUSH_MAX_FAILURES    — remove after this many consecutive delivery failures (default 5)
 *   PUSH_STALE_DAYS      — remove subscriptions last active more than N days ago (default 30)
 */

export interface PushMessage {
  userId: string;
  title: string;
  body: string;
}

/**
 * Result returned by cleanupPushSubscriptions().
 *
 * @property scanned  Total number of subscriptions evaluated.
 * @property removed  Number of subscriptions deleted.
 * @property failed   Number of subscriptions that encountered an error during removal.
 */
export interface PushSubscriptionCleanupResult {
  scanned: number;
  removed: number;
  failed: number;
}

/**
 * A stored push subscription record.
 *
 * In a real implementation this would be persisted in a database or Redis.
 * The in-memory store here provides the full cleanup contract so tests can
 * run without external dependencies.
 */
export interface PushSubscription {
  /** Opaque endpoint identifier (e.g., FCM registration token or Web Push endpoint) */
  endpoint: string;
  userId: string;
  /** ISO-8601 timestamp of the last successful delivery */
  lastActiveAt: string;
  /** Consecutive delivery failures since the last success */
  failureCount: number;
  /** ISO-8601 timestamp when the subscription was registered */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// In-memory subscription store (replace with DB/Redis layer in production)
// ---------------------------------------------------------------------------

const subscriptions = new Map<string, PushSubscription>();

// ---------------------------------------------------------------------------
// Configuration (environment-driven, with safe defaults)
// ---------------------------------------------------------------------------

function getMaxFailures(): number {
  const val = Number(process.env.PUSH_MAX_FAILURES);
  return Number.isFinite(val) && val > 0 ? val : 5;
}

function getStaleDays(): number {
  const val = Number(process.env.PUSH_STALE_DAYS);
  return Number.isFinite(val) && val > 0 ? val : 30;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a push subscription for a user.
 */
export function addPushSubscription(sub: PushSubscription): void {
  subscriptions.set(sub.endpoint, sub);
}

/**
 * Look up a subscription by endpoint.
 */
export function getPushSubscription(
  endpoint: string
): PushSubscription | undefined {
  return subscriptions.get(endpoint);
}

/**
 * Record a successful delivery for a subscription and reset failure count.
 */
export function recordDeliverySuccess(endpoint: string): void {
  const sub = subscriptions.get(endpoint);
  if (!sub) return;
  sub.failureCount = 0;
  sub.lastActiveAt = new Date().toISOString();
}

/**
 * Increment the failure count for a subscription.
 * The subscription will be eligible for cleanup once the count exceeds the
 * PUSH_MAX_FAILURES threshold.
 */
export function recordDeliveryFailure(endpoint: string): void {
  const sub = subscriptions.get(endpoint);
  if (!sub) return;
  sub.failureCount += 1;
}

/**
 * Remove expired or repeatedly failing subscriptions.
 *
 * A subscription is removed when either:
 *   (a) failureCount >= PUSH_MAX_FAILURES, OR
 *   (b) lastActiveAt is older than PUSH_STALE_DAYS days ago.
 *
 * Returns a PushSubscriptionCleanupResult with counts for observability.
 */
export function cleanupPushSubscriptions(): PushSubscriptionCleanupResult {
  const maxFailures = getMaxFailures();
  const staleCutoff = new Date(
    Date.now() - getStaleDays() * 24 * 60 * 60 * 1000
  );

  let scanned = 0;
  let removed = 0;
  let failed = 0;

  for (const [endpoint, sub] of subscriptions) {
    scanned += 1;

    const isFailureExceeded = sub.failureCount >= maxFailures;
    const isStale = new Date(sub.lastActiveAt) < staleCutoff;

    if (isFailureExceeded || isStale) {
      try {
        subscriptions.delete(endpoint);
        removed += 1;
      } catch {
        failed += 1;
      }
    }
  }

  return { scanned, removed, failed };
}

/**
 * Return a snapshot of all current subscriptions (read-only view).
 * Useful for diagnostics and integration tests.
 */
export function listPushSubscriptions(): ReadonlyArray<PushSubscription> {
  return [...subscriptions.values()];
}

/**
 * Remove all subscriptions (used in tests to reset state between cases).
 */
export function clearPushSubscriptions(): void {
  subscriptions.clear();
}

// ---------------------------------------------------------------------------
// Delivery stub
// ---------------------------------------------------------------------------

/**
 * Send a push notification to a user.
 *
 * TODO: Integrate push provider (FCM / Web Push / APNs).
 * When integrated, call recordDeliverySuccess / recordDeliveryFailure
 * based on the provider response.
 */
export async function sendPush(_message: PushMessage): Promise<void> {
  throw new Error("Not implemented — TODO: push provider");
}
