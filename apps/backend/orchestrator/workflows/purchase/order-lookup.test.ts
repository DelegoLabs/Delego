import { describe, it, expect, vi } from "vitest";
import {
  lookupOrderPaymentStatus,
  OrderPaymentNotFoundError,
  type OrderLookupAdapter,
  type PaymentsOrderLookupClient,
  createHttpOrderLookupAdapter,
} from "./order-lookup.js";

describe("lookupOrderPaymentStatus", () => {
  it("returns payment status from a mocked adapter", async () => {
    const adapter: OrderLookupAdapter = {
      lookup: vi.fn().mockResolvedValue({
        orderId: "ord-1",
        paymentId: "pay-1",
        status: "funded",
        txHash: "tx-abc",
      }),
    };

    const result = await lookupOrderPaymentStatus("ord-1", adapter);

    expect(result).toEqual({
      orderId: "ord-1",
      paymentId: "pay-1",
      status: "funded",
      txHash: "tx-abc",
    });
  });

  it("returns null when no payment record exists", async () => {
    const adapter: OrderLookupAdapter = {
      lookup: vi.fn().mockResolvedValue(null),
    };

    const result = await lookupOrderPaymentStatus("ord-missing", adapter);
    expect(result).toBeNull();
  });

  it("throws OrderPaymentNotFoundError when payment is required but missing", async () => {
    const adapter: OrderLookupAdapter = {
      lookup: vi.fn().mockResolvedValue(null),
    };

    await expect(
      lookupOrderPaymentStatus("ord-missing", adapter, { required: true })
    ).rejects.toThrow(OrderPaymentNotFoundError);
  });

  it("uses HTTP client adapter and handles 404 as missing payment", async () => {
    const client: PaymentsOrderLookupClient = {
      fetchPaymentStatus: vi.fn().mockResolvedValue(null),
    };
    const adapter = createHttpOrderLookupAdapter(client);

    const result = await lookupOrderPaymentStatus("ord-404", adapter);
    expect(result).toBeNull();
    expect(client.fetchPaymentStatus).toHaveBeenCalledWith("ord-404");
  });
});
