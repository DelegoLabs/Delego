import type { Logger } from "@delego/utils";
import type { RedisClient, PublishResult } from "./types.js";

function isTransientError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("timeout") ||
    msg.includes("readonly") ||
    msg.includes("loading") ||
    msg.includes("connection closed")
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RedisPublisher {
  private readonly client: RedisClient;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly log: Logger;

  constructor(
    client: RedisClient,
    log: Logger,
    maxRetries = 3,
    baseDelayMs = 100,
  ) {
    this.client = client;
    this.log = log;
    this.maxRetries = maxRetries;
    this.baseDelayMs = baseDelayMs;
  }

  async publish(channel: string, message: string): Promise<PublishResult> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.client.publish(channel, message);
        this.log.info("Redis publish succeeded", { channel, attempt });
        return { channel, delivered: true, attempts: attempt };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        if (!isTransientError(error)) {
          this.log.warn("Redis publish failed (non-transient)", {
            channel,
            attempt,
            error: error.message,
          });
          return {
            channel,
            delivered: false,
            attempts: attempt,
            error: error.message,
          };
        }

        if (attempt < this.maxRetries) {
          const delay = this.baseDelayMs * 2 ** (attempt - 1);
          this.log.warn("Redis publish transient failure, retrying", {
            channel,
            attempt,
            nextDelayMs: delay,
            error: error.message,
          });
          await sleep(delay);
        } else {
          this.log.error("Redis publish exhausted retries", {
            channel,
            attempts: attempt,
            error: error.message,
          });
        }
      }
    }

    return {
      channel,
      delivered: false,
      attempts: this.maxRetries,
      error: "publish failed after all retries",
    };
  }
}
