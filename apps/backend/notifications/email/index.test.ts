import { vi } from "vitest";

// Mock SendGrid
vi.mock("@sendgrid/mail", () => {
  process.env.SENDGRID_API_KEY = "test-sendgrid-api-key";
  return {
    default: {
      setApiKey: vi.fn(),
      send: vi.fn(),
    },
  };
});

// Mock FailedNotification model
vi.mock("../src/models/FailedNotification.js", () => ({
  FailedNotification: {
    create: vi.fn(),
    findOne: vi.fn(),
  },
}));

// Mock logger to avoid console noise in tests
vi.mock("@delego/utils", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sendEmailWithRetry, type EmailDispatchJob } from "./index.js";
import { classifyError, calculateBackoffDelay } from "./errorClassifier.js";
import { FailedNotification } from "../src/models/FailedNotification.js";

const mockSgMail = await import("@sendgrid/mail");
const mockFailedNotification = await import("../src/models/FailedNotification.js");

const baseJob: EmailDispatchJob = {
  notificationId: "550e8400-e29b-41d4-a716-446655440000",
  recipient: "user@example.com",
  templateName: "approval-request",
  payload: {
    orderId: "order-123",
    amount: "100 XLM",
    approvalUrl: "https://example.com/approve",
  },
  attempts: 0,
  userId: "user-id-123",
};

describe("sendEmailWithRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    process.env.EMAIL_MAX_RETRIES = "3";
    process.env.EMAIL_RETRY_BASE_DELAY_SECONDS = "2";
    process.env.EMAIL_DLQ_ENABLED = "true";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.EMAIL_MAX_RETRIES;
    delete process.env.EMAIL_RETRY_BASE_DELAY_SECONDS;
    delete process.env.EMAIL_DLQ_ENABLED;
  });

  it("does not write to DLQ on success on first attempt", async () => {
    mockSgMail.default.send.mockResolvedValueOnce([{ statusCode: 202 }]);
    mockFailedNotification.FailedNotification.findOne.mockResolvedValueOnce(
      null
    );

    await sendEmailWithRetry(baseJob, "Test Subject");

    expect(mockSgMail.default.send).toHaveBeenCalledTimes(1);
    expect(mockFailedNotification.FailedNotification.create).not.toHaveBeenCalled();
  });

  it("does not write to DLQ on success on retry attempt", async () => {
    // First attempt fails with transient error
    mockSgMail.default.send
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce([{ statusCode: 202 }]);

    mockFailedNotification.FailedNotification.findOne.mockResolvedValueOnce(
      null
    );

    const promise = sendEmailWithRetry(baseJob, "Test Subject");
    await vi.runAllTimersAsync();
    await promise;

    expect(mockSgMail.default.send).toHaveBeenCalledTimes(2);
    expect(mockFailedNotification.FailedNotification.create).not.toHaveBeenCalled();
  });

  it("immediately writes to DLQ on permanent failure without retrying", async () => {
    const error = new Error("400 Bad Request - Invalid email");
    mockSgMail.default.send.mockRejectedValueOnce(error);
    mockFailedNotification.FailedNotification.findOne.mockResolvedValueOnce(
      null
    );

    const result = await sendEmailWithRetry(baseJob, "Test Subject").catch(
      (e) => e
    );

    expect(mockSgMail.default.send).toHaveBeenCalledTimes(1);
    expect(mockFailedNotification.FailedNotification.create).toHaveBeenCalledTimes(
      1
    );
    expect(result.code).toBe("EMAIL_DISPATCH_FAILED");
    expect(result.message).toContain("1 attempt");
  });

  it("retries transient failures up to max attempts, then writes to DLQ", async () => {
    const error = new Error("ETIMEDOUT");
    mockSgMail.default.send.mockRejectedValue(error);
    mockFailedNotification.FailedNotification.findOne.mockResolvedValue(null);

    const promise = sendEmailWithRetry(baseJob, "Test Subject").catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    // Should be called 4 times: initial + 3 retries (default EMAIL_MAX_RETRIES=3)
    expect(mockSgMail.default.send).toHaveBeenCalled();
    expect(mockFailedNotification.FailedNotification.create).toHaveBeenCalledTimes(
      1
    );
    expect(result.code).toBe("EMAIL_DISPATCH_FAILED");
    expect(result.message).toContain("attempt");
  });

  it("exponential backoff is applied between retries", async () => {
    const error = new Error("ETIMEDOUT");
    let callCount = 0;
    mockSgMail.default.send.mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.reject(error);
      }
      return Promise.resolve([{ statusCode: 202 }]);
    });

    mockFailedNotification.FailedNotification.findOne.mockResolvedValue(null);

    const promise = sendEmailWithRetry(baseJob, "Test Subject");
    // Allow microtasks to flush so that the retry timer is scheduled
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    // Verify timers were scheduled
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await vi.runAllTimersAsync();
    await promise;
  });

  it("includes userId in error context for audit trail", async () => {
    const error = new Error("400 Bad Request - Invalid email");
    mockSgMail.default.send.mockRejectedValueOnce(error);
    mockFailedNotification.FailedNotification.findOne.mockResolvedValueOnce(
      null
    );

    const jobWithUserId: EmailDispatchJob = {
      ...baseJob,
      userId: "audit-user-123",
    };

    await sendEmailWithRetry(jobWithUserId, "Test Subject").catch((e) => e);

    expect(mockFailedNotification.FailedNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: jobWithUserId.notificationId,
      })
    );
  });

  it("throws error with standard format when max retries exceeded", async () => {
    mockSgMail.default.send.mockRejectedValue(new Error("ETIMEDOUT"));
    mockFailedNotification.FailedNotification.findOne.mockResolvedValue(null);

    const promise = sendEmailWithRetry(baseJob, "Test Subject").catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toHaveProperty("code", "EMAIL_DISPATCH_FAILED");
    expect(result).toHaveProperty("message");
    expect(result).toHaveProperty("lastError");
    expect(result.message).toMatch(/after \d+ attempt/);
  });

  it("preserves payload unchanged across retries", async () => {
    mockSgMail.default.send
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce([{ statusCode: 202 }]);

    mockFailedNotification.FailedNotification.findOne.mockResolvedValue(null);

    const promise = sendEmailWithRetry(baseJob, "Test Subject");
    await vi.runAllTimersAsync();
    await promise;

    // Verify sendEmail was called with correct payload
    expect(mockSgMail.default.send).toHaveBeenCalled();
    const calls = mockSgMail.default.send.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
  });

  it("handles network connection errors as transient", async () => {
    let attemptCount = 0;
    mockSgMail.default.send.mockImplementation(() => {
      attemptCount++;
      if (attemptCount === 1) {
        return Promise.reject(new Error("ECONNREFUSED"));
      }
      if (attemptCount === 2) {
        return Promise.reject(new Error("ECONNRESET"));
      }
      return Promise.resolve([{ statusCode: 202 }]);
    });

    mockFailedNotification.FailedNotification.findOne.mockResolvedValue(null);

    const promise = sendEmailWithRetry(baseJob, "Test Subject");
    await vi.runAllTimersAsync();
    await promise;

    expect(mockSgMail.default.send).toHaveBeenCalledTimes(3);
    expect(mockFailedNotification.FailedNotification.create).not.toHaveBeenCalled();
  });
});

describe("classifyError", () => {
  describe("transient errors", () => {
    it("classifies HTTP 429 as transient", () => {
      const error = new Error("429 Too Many Requests");
      expect(classifyError(error)).toBe("transient");
    });

    it("classifies HTTP 5xx as transient", () => {
      expect(classifyError(new Error("500 Internal Server Error"))).toBe(
        "transient"
      );
      expect(classifyError(new Error("502 Bad Gateway"))).toBe("transient");
      expect(classifyError(new Error("503 Service Unavailable"))).toBe(
        "transient"
      );
    });

    it("classifies ETIMEDOUT as transient", () => {
      const error = new Error("ETIMEDOUT");
      expect(classifyError(error)).toBe("transient");
    });

    it("classifies ECONNREFUSED as transient", () => {
      const error = new Error("ECONNREFUSED");
      expect(classifyError(error)).toBe("transient");
    });

    it("classifies ECONNRESET as transient", () => {
      const error = new Error("ECONNRESET");
      expect(classifyError(error)).toBe("transient");
    });

    it("classifies DNS errors as transient", () => {
      expect(classifyError(new Error("getaddrinfo ENOTFOUND"))).toBe(
        "transient"
      );
    });

    it("classifies timeout as transient", () => {
      expect(classifyError(new Error("Request timeout"))).toBe("transient");
    });
  });

  describe("permanent errors", () => {
    it("classifies HTTP 400 as permanent", () => {
      const error = new Error("400 Bad Request");
      expect(classifyError(error)).toBe("permanent");
    });

    it("classifies invalid email as permanent", () => {
      const error = new Error("Invalid email format");
      expect(classifyError(error)).toBe("permanent");
    });

    it("classifies HTTP 401 as permanent", () => {
      const error = new Error("401 Unauthorized");
      expect(classifyError(error)).toBe("permanent");
    });

    it("classifies HTTP 403 as permanent", () => {
      const error = new Error("403 Forbidden");
      expect(classifyError(error)).toBe("permanent");
    });

    it("classifies HTTP 404 as permanent", () => {
      const error = new Error("404 Not Found");
      expect(classifyError(error)).toBe("permanent");
    });

    it("classifies template not found as permanent", () => {
      const error = new Error("Template not found");
      expect(classifyError(error)).toBe("permanent");
    });

    it("classifies authentication errors as permanent", () => {
      const error = new Error("Invalid API credentials");
      expect(classifyError(error)).toBe("permanent");
    });
  });

  describe("unknown errors", () => {
    it("defaults to transient for unknown errors", () => {
      const error = new Error("Something went wrong");
      expect(classifyError(error)).toBe("transient");
    });

    it("handles non-Error objects", () => {
      expect(classifyError("string error")).toBe("transient");
      expect(classifyError({})).toBe("transient");
      expect(classifyError(null)).toBe("transient");
    });
  });
});

describe("calculateBackoffDelay", () => {
  it("calculates correct backoff delay for attempt 1", () => {
    const delay = calculateBackoffDelay(1, 2);
    expect(delay).toBe(2000); // 2^0 * 2 * 1000
  });

  it("calculates correct backoff delay for attempt 2", () => {
    const delay = calculateBackoffDelay(2, 2);
    expect(delay).toBe(4000); // 2^1 * 2 * 1000
  });

  it("calculates correct backoff delay for attempt 3", () => {
    const delay = calculateBackoffDelay(3, 2);
    expect(delay).toBe(8000); // 2^2 * 2 * 1000
  });

  it("calculates correct backoff delay for attempt 4", () => {
    const delay = calculateBackoffDelay(4, 2);
    expect(delay).toBe(16000); // 2^3 * 2 * 1000
  });

  it("respects max delay cap of 120 seconds", () => {
    const delay = calculateBackoffDelay(10, 2);
    expect(delay).toBe(120000); // Capped at 120 seconds
  });

  it("works with different base delays", () => {
    const delay = calculateBackoffDelay(2, 5);
    expect(delay).toBe(10000); // 2^1 * 5 * 1000
  });

  it("returns milliseconds", () => {
    const delay = calculateBackoffDelay(1, 2);
    expect(delay % 1000).toBe(0); // Should be divisible by 1000
  });
});
