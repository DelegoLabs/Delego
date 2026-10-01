import { describe, it, expect } from "vitest";
import { computePayoutProjections, type MerchantEscrowOrder } from "./merchantEscrowOrders";

describe("merchantEscrowOrders", () => {
  describe("computePayoutProjections", () => {
    it("computes projections correctly for active orders", () => {
      const orders: MerchantEscrowOrder[] = [
        {
          orderId: "1",
          escrowId: "1",
          buyerAddress: "A",
          amountStroops: "100000",
          currency: "XLM",
          status: "funded",
          shippingAddress: "",
          fundedAt: "",
          deadline: ""
        },
        {
          orderId: "2",
          escrowId: "2",
          buyerAddress: "B",
          amountStroops: "200000",
          currency: "XLM",
          status: "shipped",
          shippingAddress: "",
          fundedAt: "",
          deadline: ""
        },
        {
          orderId: "3",
          escrowId: "3",
          buyerAddress: "C",
          amountStroops: "50000",
          currency: "XLM",
          status: "released",
          shippingAddress: "",
          fundedAt: "",
          deadline: ""
        }
      ];

      const projection = computePayoutProjections(orders);

      // Total active amount = 100000 + 200000 = 300000
      expect(projection.pendingGrossStroops).toBe(300000n);
      
      // 1% platform fee = 300000 * 100 / 10000 = 3000
      expect(projection.estimatedPlatformFees).toBe(3000n);
      
      // Net payout = 300000 - 3000 = 297000
      expect(projection.projectedNetPayout).toBe(297000n);
    });

    it("returns zero projections for empty or fully released orders", () => {
      const orders: MerchantEscrowOrder[] = [
        {
          orderId: "3",
          escrowId: "3",
          buyerAddress: "C",
          amountStroops: "50000",
          currency: "XLM",
          status: "released",
          shippingAddress: "",
          fundedAt: "",
          deadline: ""
        }
      ];
      
      const projection = computePayoutProjections(orders);
      expect(projection.pendingGrossStroops).toBe(0n);
      expect(projection.estimatedPlatformFees).toBe(0n);
      expect(projection.projectedNetPayout).toBe(0n);
    });
  });
});

