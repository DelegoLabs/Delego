import { describe, it, expect } from "vitest";
import { handleMerchantCancellation } from "./index.js";
import type { MerchantCancellationEvent } from "./index.js";

const event: MerchantCancellationEvent = {
  orderId: "ord-1",
  merchantId: "mer-1",
  reasonCode: "out_of_stock",
  occurredAt: "2024-01-01T12:00:00.000Z",
};

describe("handleMerchantCancellation", () => {
  describe("pre-funding cancellation (escrow not yet funded)", () => {
    it("transitions checkout to canceled status", () => {
      const { checkout } = handleMerchantCancellation(event, false);
      expect(checkout.status).toBe("canceled");
      expect(checkout.orderId).toBe("ord-1");
      expect(checkout.reason).toBe("out_of_stock");
      expect(checkout.refundNeeded).toBe(false);
    });

    it("does not publish a refund-needed event", () => {
      const { refundEvent } = handleMerchantCancellation(event, false);
      expect(refundEvent).toBeNull();
    });
  });

  describe("post-funding cancellation (escrow already funded)", () => {
    it("transitions checkout to canceled with refundNeeded flag set", () => {
      const { checkout } = handleMerchantCancellation(event, true);
      expect(checkout.status).toBe("canceled");
      expect(checkout.refundNeeded).toBe(true);
    });

    it("publishes a refund-needed event with orderId and merchantId", () => {
      const { refundEvent } = handleMerchantCancellation(event, true);
      expect(refundEvent).not.toBeNull();
      expect(refundEvent?.orderId).toBe("ord-1");
      expect(refundEvent?.merchantId).toBe("mer-1");
    });

    it("refund event carries the same timestamp as the cancellation", () => {
      const { refundEvent } = handleMerchantCancellation(event, true);
      expect(refundEvent?.triggeredAt).toBe(event.occurredAt);
    });
  });
});
