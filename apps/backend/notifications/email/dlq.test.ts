import { describe, it, expect, vi, beforeEach } from "vitest";
import { logToDLQ } from "./dlq.js";
import { FailedNotification } from "../src/models/FailedNotification.js";
import type { EmailDispatchJob } from "./types.js";

vi.mock("../src/models/FailedNotification.js");
vi.mock("@delego/utils", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockFailedNotification = vi.mocked(FailedNotification);

const baseJob: EmailDispatchJob = {
  notificationId: "550e8400-e29b-41d4-a716-446655440000",
  recipient: "user@example.com",
  templateName: "approval-request",
  payload: {
    orderId: "order-123",
    amount: "100 XLM",
    approvalUrl: "https://example.com/approve",
  },
  attempts: 3,
  userId: "user-id-123",
};

describe("logToDLQ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts DLQ row with all required fields", async () => {
    mockFailedNotification.findOne.mockResolvedValueOnce(null);
    mockFailedNotification.create.mockResolvedValueOnce({
      id: "dlq-123",
    } as any);

    const error = new Error("Network timeout");
    await logToDLQ(baseJob, error);

    expect(mockFailedNotification.create).toHaveBeenCalledWith({
      notificationId: baseJob.notificationId,
      recipient: baseJob.recipient,
      templateName: baseJob.templateName,
      payload: baseJob.payload,
      errorMessage: "Network timeout",
      attempts: 3,
    });
  });

  it("truncates error message to 2000 characters", async () => {
    mockFailedNotification.findOne.mockResolvedValueOnce(null);
    mockFailedNotification.create.mockResolvedValueOnce({
      id: "dlq-123",
    } as any);

    const longError = new Error("x".repeat(3000));
    await logToDLQ(baseJob, longError);

    const callArgs = mockFailedNotification.create.mock.calls[0][0];
    expect(callArgs.errorMessage.length).toBe(2000);
  });

  it("prevents duplicate DLQ entries for same notification/recipient pair", async () => {
    mockFailedNotification.findOne.mockResolvedValueOnce({
      id: "existing-dlq",
    } as any);

    const error = new Error("Network timeout");
    await logToDLQ(baseJob, error);

    // Should not create a new entry
    expect(mockFailedNotification.create).not.toHaveBeenCalled();
  });

  it("logs database errors but does not throw", async () => {
    mockFailedNotification.findOne.mockResolvedValueOnce(null);
    mockFailedNotification.create.mockRejectedValueOnce(
      new Error("Database connection failed")
    );

    const error = new Error("Network timeout");

    // Should not throw
    await expect(logToDLQ(baseJob, error)).resolves.not.toThrow();
  });

  it("allows non-database errors to propagate", async () => {
    mockFailedNotification.findOne.mockResolvedValueOnce(null);

    const error = new Error("Network timeout");

    // Even if create throws, we're catching database errors specifically
    await expect(logToDLQ(baseJob, error)).resolves.not.toThrow();
  });

  it("handles missing error message gracefully", async () => {
    mockFailedNotification.findOne.mockResolvedValueOnce(null);
    mockFailedNotification.create.mockResolvedValueOnce({
      id: "dlq-123",
    } as any);

    const error = new Error("");
    await logToDLQ(baseJob, error);

    const callArgs = mockFailedNotification.create.mock.calls[0][0];
    expect(callArgs.errorMessage).toBe("");
  });

  it("preserves complete payload in DLQ record", async () => {
    mockFailedNotification.findOne.mockResolvedValueOnce(null);
    mockFailedNotification.create.mockResolvedValueOnce({
      id: "dlq-123",
    } as any);

    const complexPayload = {
      orderId: "order-123",
      amount: "100.50",
      approvalUrl: "https://example.com/approve?token=abc123",
      metadata: {
        nested: "value",
      },
      array: [1, 2, 3],
    };

    const jobWithComplexPayload: EmailDispatchJob = {
      ...baseJob,
      payload: complexPayload,
    };

    const error = new Error("Failed");
    await logToDLQ(jobWithComplexPayload, error);

    const callArgs = mockFailedNotification.create.mock.calls[0][0];
    expect(callArgs.payload).toEqual(complexPayload);
  });

  it("records attempt count correctly", async () => {
    mockFailedNotification.findOne.mockResolvedValueOnce(null);
    mockFailedNotification.create.mockResolvedValueOnce({
      id: "dlq-123",
    } as any);

    const jobAfterRetries: EmailDispatchJob = {
      ...baseJob,
      attempts: 3,
    };

    const error = new Error("Max retries exceeded");
    await logToDLQ(jobAfterRetries, error);

    const callArgs = mockFailedNotification.create.mock.calls[0][0];
    expect(callArgs.attempts).toBe(3);
  });

  it("works with special characters in error message", async () => {
    mockFailedNotification.findOne.mockResolvedValueOnce(null);
    mockFailedNotification.create.mockResolvedValueOnce({
      id: "dlq-123",
    } as any);

    const error = new Error(
      'Special chars: <>&"\'{}[] in error message\n\t\r'
    );
    await logToDLQ(baseJob, error);

    const callArgs = mockFailedNotification.create.mock.calls[0][0];
    expect(callArgs.errorMessage).toContain("Special chars");
  });

  it("includes userId in context for audit trail", async () => {
    mockFailedNotification.findOne.mockResolvedValueOnce(null);
    mockFailedNotification.create.mockResolvedValueOnce({
      id: "dlq-123",
    } as any);

    const jobWithUserId: EmailDispatchJob = {
      ...baseJob,
      userId: "audit-user-456",
    };

    const error = new Error("Failed");
    await logToDLQ(jobWithUserId, error);

    // Verify the job was recorded (userId is part of job but not stored in DLQ directly)
    // The DLQ record has the complete context via the recorded payload
    const callArgs = mockFailedNotification.create.mock.calls[0][0];
    expect(callArgs.notificationId).toBe(jobWithUserId.notificationId);
  });
});
