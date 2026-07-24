import { describe, it, expect, beforeEach } from "vitest";
import { PushDeliveryTracker } from "./deliveryTracker.js";

describe("PushDeliveryTracker (Issue #344)", () => {
  let tracker: PushDeliveryTracker;

  beforeEach(() => {
    tracker = new PushDeliveryTracker();
  });

  it("records new delivery attempt with pending status", () => {
    const record = tracker.recordAttempt("usr-1", "https://push.example.com/sub-1", {
      title: "Test",
    });

    expect(record.status).toBe("pending");
    expect(record.attempts).toBe(0);
    expect(record.flaggedForReview).toBe(false);
    expect(tracker.getRecord(record.id)).toEqual(record);
  });

  it("records delivery success and updates status to delivered", () => {
    const record = tracker.recordAttempt("usr-1", "https://push.example.com/sub-1", {
      title: "Test",
    });

    const updated = tracker.recordSuccess(record.id);
    expect(updated.status).toBe("delivered");
    expect(updated.attempts).toBe(1);
  });

  it("records failure with backoff and flags permanently failed notifications for review when max attempts reached", () => {
    const record = tracker.recordAttempt(
      "usr-1",
      "https://push.example.com/sub-1",
      { title: "Test" },
      3,
      "rec-123"
    );

    // Attempt 1 fails
    const fail1 = tracker.recordFailure("rec-123", "Network timeout", 1000);
    expect(fail1.status).toBe("failed");
    expect(fail1.attempts).toBe(1);
    expect(fail1.nextRetryAt).toBeDefined();
    expect(fail1.flaggedForReview).toBe(false);

    // Attempt 2 fails
    const fail2 = tracker.recordFailure("rec-123", "503 Service Unavailable", 1000);
    expect(fail2.status).toBe("failed");
    expect(fail2.attempts).toBe(2);

    // Attempt 3 fails (maxAttempts = 3) -> permanently failed & flagged for review
    const fail3 = tracker.recordFailure("rec-123", "Connection reset", 1000);
    expect(fail3.status).toBe("permanently_failed");
    expect(fail3.attempts).toBe(3);
    expect(fail3.flaggedForReview).toBe(true);

    const flagged = tracker.getFlaggedForReview();
    expect(flagged.length).toBe(1);
    expect(flagged[0].id).toBe("rec-123");
  });
});
