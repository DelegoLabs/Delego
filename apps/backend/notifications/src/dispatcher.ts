import { Redis } from "ioredis";
import { createLogger } from "@delego/utils";
import { randomUUID } from "crypto";
import {
  sendEmailWithRetry,
  type EmailDispatchJob,
} from "../email/index.js";
import {
  sendPushNotification,
  cleanupPushSubscriptions,
  parseTrackedPushSubscription,
  recordPushDeliveryFailure,
  serializeTrackedPushSubscription,
  type PushSubscription,
  type PushPayload,
  type PushSubscriptionCleanupResult,
  type TrackedPushSubscription,
} from "../push/index.js";
import { checkAndMarkDispatched } from "./idempotency.js";

const log = createLogger(
  "notifications:dispatcher",
  process.env.LOG_LEVEL ?? "info"
);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true });

const SUBSCRIPTIONS_NS = "push:subscriptions";

export interface TransactionApprovalNotification {
  userId: string;
  email?: string;
  transactionId: string;
  amount: string;
  merchant: string;
  approvalUrl: string;
}

export async function savePushSubscription(
  userId: string,
  subscription: PushSubscription
): Promise<void> {
  const key = `${SUBSCRIPTIONS_NS}:${userId}`;
  const tracked: TrackedPushSubscription = {
    subscription,
    failureCount: 0,
    createdAt: Date.now(),
  };
  // Drop any prior member for the same endpoint (legacy or tracked).
  await removePushSubscription(userId, subscription.endpoint);
  await redis.sadd(key, serializeTrackedPushSubscription(tracked));
}

export async function removePushSubscription(
  userId: string,
  endpoint: string
): Promise<void> {
  const key = `${SUBSCRIPTIONS_NS}:${userId}`;
  const members = await redis.smembers(key);
  for (const member of members) {
    const tracked = parseTrackedPushSubscription(member);
    if (tracked.subscription.endpoint === endpoint) {
      await redis.srem(key, member);
    }
  }
}

/**
 * Scan a user's push subscriptions and remove expired or repeatedly failing
 * ones. Returns aggregate counts for ops/metrics (issue #137).
 */
export async function cleanupUserPushSubscriptions(
  userId: string
): Promise<PushSubscriptionCleanupResult> {
  const key = `${SUBSCRIPTIONS_NS}:${userId}`;
  const members = await redis.smembers(key);
  const tracked = members.map((m) => parseTrackedPushSubscription(m));
  const { result, retained, removed } = cleanupPushSubscriptions(tracked);

  for (const member of members) {
    await redis.srem(key, member);
  }
  if (retained.length > 0) {
    await redis.sadd(
      key,
      ...retained.map((t) => serializeTrackedPushSubscription(t))
    );
  }

  if (removed.length > 0) {
    log.info("Cleaned up push subscriptions", {
      userId,
      scanned: result.scanned,
      removed: result.removed,
      failed: result.failed,
    });
  }

  return result;
}

export async function dispatchTransactionApproval(
  notification: TransactionApprovalNotification,
  eventId?: string
): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (notification.email) {
    const shouldSend =
      !eventId ||
      (await checkAndMarkDispatched(redis, {
        userId: notification.userId,
        channel: "email",
        eventType: "transaction_approval",
        eventId,
      }));

    if (shouldSend) {
      const notificationId = randomUUID();
      const emailJob: EmailDispatchJob = {
        notificationId,
        recipient: notification.email,
        templateName: "approval-request",
        payload: {
          orderId: notification.transactionId,
          amount: notification.amount,
          approvalUrl: notification.approvalUrl,
        },
        attempts: 0,
        userId: notification.userId,
      };

      tasks.push(
        sendEmailWithRetry(emailJob, "Purchase Approval Required").catch(
          (err) =>
            log.error("Failed to send email notification", {
              error: err instanceof Error ? err.message : String(err),
              userId: notification.userId,
              notificationId,
            })
        )
      );
    } else {
      log.info("Skipping duplicate email dispatch", {
        userId: notification.userId,
        eventId,
      });
    }
  }

  const key = `${SUBSCRIPTIONS_NS}:${notification.userId}`;
  const members = await redis.smembers(key);
  const trackedList = members.map((m) => ({
    raw: m,
    tracked: parseTrackedPushSubscription(m),
  }));

  for (const { raw, tracked } of trackedList) {
    const shouldSend =
      !eventId ||
      (await checkAndMarkDispatched(redis, {
        userId: notification.userId,
        channel: "push",
        eventType: "transaction_approval",
        eventId,
      }));

    if (!shouldSend) {
      log.info("Skipping duplicate push dispatch", {
        userId: notification.userId,
        eventId,
      });
      continue;
    }

    const payload: PushPayload = {
      title: "Purchase Approval Required",
      body: `${notification.merchant} is requesting ${notification.amount}`,
      data: {
        type: "transaction_approval",
        transactionId: notification.transactionId,
        amount: notification.amount,
        merchant: notification.merchant,
        approvalUrl: notification.approvalUrl,
      },
      actions: [
        { action: "approve", title: "Approve" },
        { action: "deny", title: "Deny" },
      ],
    };
    tasks.push(
      sendPushNotification(tracked.subscription, payload).catch(async (err) => {
        log.error("Failed to send push notification", {
          error: err instanceof Error ? err.message : String(err),
          userId: notification.userId,
        });
        const updated = recordPushDeliveryFailure(tracked);
        await redis.srem(key, raw);
        await redis.sadd(key, serializeTrackedPushSubscription(updated));
      })
    );
  }

  await Promise.all(tasks);
}
