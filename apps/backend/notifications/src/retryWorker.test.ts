import { describe, it, expect, beforeEach, vi } from "vitest";
import { PushDeliveryTracker } from "./deliveryTracker.js";
import { PushRetryWorker, calculateExponentialBackoff } from "./retryWorker.js";

describe("PushRetryWorker (Issue #344)", () => {
  let tracker: PushDeliveryTracker;
  let worker: PushRetryWorker;

  beforeEach(() => {
    tracker = new PushDeliveryTracker();
    worker = new PushRetryWorker(tracker, 1000);
  });

  describe("calculateExponentialBackoff", () => {
    it("calculates exponential backoff delay correctly", () => {
      expect(calculateExponentialBackoff(1, 1000)).toBe(1000); // 1000 * 2^0
      expect(calculateExponentialBackoff(2, 1000)).toBe(2000); // 1000 * 2^1
      expect(calculateExponentialBackoff(3, 1000)).toBe(4000); // 1000 * 2^2
      expect(calculateExponentialBackoff(4, 1000)).toBe(8000); // 1000 * 2^3
    });
  });

  describe("processRetries", () => {
    it("retries pending failed notifications and records success on retry", async () => {
      const rec = tracker.recordAttempt("usr-1", "https://push.com/1", { msg: "hi" }, 3, "r-1");
      tracker.recordFailure("r-1", "temp error", 1000);

      // Travel to future when retry is ready
      const future = new Date(Date.now() + 5000);
      const sender = vi.fn().mockResolvedValue(undefined);

      const result = await worker.processRetries(sender, future);

      expect(result.retried).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(sender).toHaveBeenCalledTimes(1);
      expect(tracker.getRecord("r-1")?.status).toBe("delivered");
    });

    it("retries failed notifications and flags as permanently failed when max attempts exceeded", async () => {
      const rec = tracker.recordAttempt("usr-1", "https://push.com/2", { msg: "hi" }, 2, "r-2");
      // Attempt 1 failed
      tracker.recordFailure("r-2", "error 1", 1000);

      const future = new Date(Date.now() + 5000);
      const sender = vi.fn().mockRejectedValue(new Error("error 2"));

      const result = await worker.processRetries(sender, future);

      expect(result.retried).toBe(1);
      expect(result.permanentlyFailed).toBe(1);
      expect(tracker.getRecord("r-2")?.status).toBe("permanently_failed");
      expect(tracker.getRecord("r-2")?.flaggedForReview).toBe(true);
    });
  });
});
