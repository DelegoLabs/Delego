/**
 * Redis Pub/Sub notifications for payment lifecycle status changes.
 */

import { createRequire } from "node:module";
import { createLogger } from "@delego/utils";

const log = createLogger("payments:escrow-coordinator:events", process.env.LOG_LEVEL ?? "info");

export type PaymentStatusChannel =
  | "payment:funded"
  | "payment:released"
  | "payment:refunded"
  | "payment:failed";

export interface PaymentStatusEventPayload {
  orderId: string;
  escrowId?: string;
  txHash?: string;
  status: string;
  reason?: string;
  occurredAt: string;
}

type RedisPublisher = {
  publish(channel: string, message: string): Promise<number>;
};

let publisher: RedisPublisher | null = null;

function makeInMemoryPublisher(): RedisPublisher {
  const messages: Array<{ channel: string; message: string }> = [];
  return {
    async publish(channel: string, message: string) {
      messages.push({ channel, message });
      return 1;
    },
  };
}

function getPublisher(): RedisPublisher {
  if (publisher) return publisher;

  const isTest = process.env.NODE_ENV === "test";
  const useMock =
    isTest || process.env.MOCK_REDIS === "true" || process.env.CI === "true";

  if (useMock) {
    log.info("Using in-memory Redis publisher for payment status events");
    publisher = makeInMemoryPublisher();
  } else {
    const require = createRequire(import.meta.url);
    const { Redis } = require("ioredis") as { Redis: new (url: string) => RedisPublisher };
    publisher = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  }

  return publisher!;
}

export function _setPublisherForTesting(client: RedisPublisher): void {
  publisher = client;
}

export function _resetPublisherForTesting(): void {
  publisher = null;
}

export async function publishPaymentStatusEvent(
  channel: PaymentStatusChannel,
  payload: PaymentStatusEventPayload
): Promise<void> {
  const redis = getPublisher();
  try {
    await redis.publish(channel, JSON.stringify(payload));
    log.info("Payment status event published", { channel, orderId: payload.orderId });
  } catch (err) {
    log.error("Failed to publish payment status event", {
      channel,
      orderId: payload.orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
