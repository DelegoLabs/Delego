import { createLogger } from "@delego/utils";
import { PushDeliveryTracker, PushDeliveryRecord, defaultPushDeliveryTracker } from "./deliveryTracker.js";

const log = createLogger("notifications:retryWorker", process.env.LOG_LEVEL ?? "info");

export interface RetryBatchResult {
  retried: number;
  succeeded: number;
  failed: number;
  permanentlyFailed: number;
}

/**
 * Calculates exponential backoff delay in milliseconds.
 * Formula: baseDelayMs * 2 ^ (attempt - 1)
 */
export function calculateExponentialBackoff(attempt: number, baseDelayMs = 1000): number {
  if (attempt <= 0) return 0;
  return baseDelayMs * Math.pow(2, attempt - 1);
}

export class PushRetryWorker {
  constructor(
    private tracker: PushDeliveryTracker = defaultPushDeliveryTracker,
    private baseDelayMs = 1000
  ) {}

  /**
   * Processes a single pass of all pending push notification retries.
   */
  async processRetries(
    sender: (record: PushDeliveryRecord) => Promise<void>,
    asOf = new Date()
  ): Promise<RetryBatchResult> {
    const pending = this.tracker.getPendingRetries(asOf);
    log.info("Processing pending push retries", { count: pending.length });

    let succeeded = 0;
    let failed = 0;
    let permanentlyFailed = 0;

    for (const record of pending) {
      try {
        await sender(record);
        this.tracker.recordSuccess(record.id);
        succeeded += 1;
      } catch (err: any) {
        const updated = this.tracker.recordFailure(record.id, err.message, this.baseDelayMs);
        if (updated.status === "permanently_failed") {
          permanentlyFailed += 1;
        } else {
          failed += 1;
        }
      }
    }

    return {
      retried: pending.length,
      succeeded,
      failed,
      permanentlyFailed,
    };
  }
}
