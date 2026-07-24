import { createLogger } from "@delego/utils";
import { randomUUID } from "crypto";

const log = createLogger("notifications:deliveryTracker", process.env.LOG_LEVEL ?? "info");

export type PushDeliveryStatus = "pending" | "delivered" | "failed" | "permanently_failed";

export interface PushDeliveryRecord {
  id: string;
  userId: string;
  endpoint: string;
  payload: Record<string, unknown>;
  status: PushDeliveryStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  nextRetryAt?: string | null;
  flaggedForReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export class PushDeliveryTracker {
  private records: Map<string, PushDeliveryRecord> = new Map();

  /**
   * Track new push notification dispatch attempt.
   */
  recordAttempt(
    userId: string,
    endpoint: string,
    payload: Record<string, unknown>,
    maxAttempts = 3,
    customId?: string
  ): PushDeliveryRecord {
    const id = customId ?? randomUUID();
    const now = new Date().toISOString();
    const record: PushDeliveryRecord = {
      id,
      userId,
      endpoint,
      payload,
      status: "pending",
      attempts: 0,
      maxAttempts,
      flaggedForReview: false,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(id, record);
    log.info("Push delivery attempt recorded", { id, userId, endpoint });
    return record;
  }

  /**
   * Mark delivery as successfully delivered.
   */
  recordSuccess(id: string): PushDeliveryRecord {
    const record = this.records.get(id);
    if (!record) {
      throw new Error(`Delivery record not found: ${id}`);
    }
    record.status = "delivered";
    record.attempts += 1;
    record.nextRetryAt = null;
    record.updatedAt = new Date().toISOString();
    log.info("Push notification marked delivered", { id });
    return record;
  }

  /**
   * Record failure and update retry schedule / permanent failure flag.
   */
  recordFailure(id: string, errorMessage: string, baseDelayMs = 1000): PushDeliveryRecord {
    const record = this.records.get(id);
    if (!record) {
      throw new Error(`Delivery record not found: ${id}`);
    }

    record.attempts += 1;
    record.lastError = errorMessage;
    record.updatedAt = new Date().toISOString();

    if (record.attempts >= record.maxAttempts) {
      record.status = "permanently_failed";
      record.flaggedForReview = true;
      record.nextRetryAt = null;
      log.warn("Push notification permanently failed, flagged for review", {
        id,
        attempts: record.attempts,
        maxAttempts: record.maxAttempts,
        error: errorMessage,
      });
    } else {
      record.status = "failed";
      const backoffMs = baseDelayMs * Math.pow(2, record.attempts - 1);
      record.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
      log.info("Push notification failure recorded for retry", {
        id,
        attempts: record.attempts,
        nextRetryAt: record.nextRetryAt,
      });
    }

    return record;
  }

  getRecord(id: string): PushDeliveryRecord | undefined {
    return this.records.get(id);
  }

  getAllRecords(): PushDeliveryRecord[] {
    return Array.from(this.records.values());
  }

  getPendingRetries(asOf = new Date()): PushDeliveryRecord[] {
    const nowTime = asOf.getTime();
    return Array.from(this.records.values()).filter((r) => {
      if (r.status !== "failed" || !r.nextRetryAt) return false;
      return new Date(r.nextRetryAt).getTime() <= nowTime;
    });
  }

  getFlaggedForReview(): PushDeliveryRecord[] {
    return Array.from(this.records.values()).filter((r) => r.flaggedForReview);
  }

  clear(): void {
    this.records.clear();
  }
}

export const defaultPushDeliveryTracker = new PushDeliveryTracker();
