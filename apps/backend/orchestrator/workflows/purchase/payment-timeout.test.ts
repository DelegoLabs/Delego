import { describe, it, expect } from "vitest";
import { handlePaymentTimeout } from "./index.js";
import type { PaymentTimeoutEvent } from "./index.js";

const event: PaymentTimeoutEvent = {
  orderId: "ord-1",
  timeoutAt: "2024-01-01T00:00:00.000Z",
  reason: "escrow_funding_timeout",
};

describe("handlePaymentTimeout", () => {
  it("returns a cancellation event with matching orderId", () => {
    const result = handlePaymentTimeout(event);
    expect(result.orderId).toBe("ord-1");
    expect(result.reason).toBe("payment_timeout");
  });

  it("sets occurredAt to a valid ISO 8601 timestamp", () => {
    const result = handlePaymentTimeout(event);
    expect(new Date(result.occurredAt).toISOString()).toBe(result.occurredAt);
  });

  it("transitions from pending payment state on timeout (escrow_funding_timeout)", () => {
    const timedOut = handlePaymentTimeout({ ...event, orderId: "ord-timeout" });
    expect(timedOut.reason).toBe("payment_timeout");
    expect(timedOut.orderId).toBe("ord-timeout");
  });

  it("failure path — different orders produce independent cancellation events", () => {
    const result1 = handlePaymentTimeout({ ...event, orderId: "ord-A" });
    const result2 = handlePaymentTimeout({ ...event, orderId: "ord-B" });
    expect(result1.orderId).toBe("ord-A");
    expect(result2.orderId).toBe("ord-B");
    expect(result1.orderId).not.toBe(result2.orderId);
  });
});
