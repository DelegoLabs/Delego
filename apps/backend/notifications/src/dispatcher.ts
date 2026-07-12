import { Redis } from "ioredis";
import { createLogger } from "@delego/utils";
import { randomUUID } from "crypto";
import {
  sendEmailWithRetry,
  type EmailDispatchJob,
} from "../email/index.js";
import {
  sendPushNotification,
  type PushSubscription,
  type PushPayload,
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
  await redis.sadd(key, JSON.stringify(subscription));
}

export async function removePushSubscription(
  userId: string,
  endpoint: string
): Promise<void> {
  const key = `${SUBSCRIPTIONS_NS}:${userId}`;
  const members = await redis.smembers(key);
  for (const member of members) {
    const sub = JSON.parse(member) as PushSubscription;
    if (sub.endpoint === endpoint) {
      await redis.srem(key, member);
    }
  }
}

async function getUserSubscriptions(userId: string): Promise<PushSubscription[]> {
  const key = `${SUBSCRIPTIONS_NS}:${userId}`;
  const members = await redis.smembers(key);
  return members.map((m) => JSON.parse(m) as PushSubscription);
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

  const subscriptions = await getUserSubscriptions(notification.userId);
  for (const sub of subscriptions) {
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
      sendPushNotification(sub, payload).catch((err) =>
        log.error("Failed to send push notification", {
          error: err instanceof Error ? err.message : String(err),
          userId: notification.userId,
        })
      )
    );
  }

  await Promise.all(tasks);
}
