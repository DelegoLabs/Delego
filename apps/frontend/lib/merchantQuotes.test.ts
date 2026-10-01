import { describe, expect, it } from "vitest";
import {
  pickBestValueQuote,
  sortQuotes,
  totalCostStroops,
  type MerchantQuote,
} from "./merchantQuotes";

const quote = (over: Partial<MerchantQuote>): MerchantQuote => ({
  merchantId: "m",
  merchantName: "M",
  itemPriceStroops: "100",
  shippingPriceStroops: "0",
  estimatedDeliveryDays: 3,
  reputationScore: 4,
  contractEscrowSupported: true,
  ...over,
});

const cheap = quote({
  merchantId: "cheap",
  merchantName: "Cheap",
  itemPriceStroops: "80",
  shippingPriceStroops: "10",
  estimatedDeliveryDays: 7,
  reputationScore: 3,
});
const fast = quote({
  merchantId: "fast",
  merchantName: "Fast",
  itemPriceStroops: "120",
  shippingPriceStroops: "30",
  estimatedDeliveryDays: 1,
  reputationScore: 4,
});
const trusted = quote({
  merchantId: "trusted",
  merchantName: "Trusted",
  itemPriceStroops: "95",
  shippingPriceStroops: "5",
  estimatedDeliveryDays: 3,
  reputationScore: 5,
});

describe("merchantQuotes", () => {
  it("sums item and shipping stroops", () => {
    expect(totalCostStroops(cheap)).toBe(90n);
  });

  it("sorts by cost, speed and reputation without mutating input", () => {
    const quotes = [fast, trusted, cheap];
    const ids = (qs: MerchantQuote[]) => qs.map((q) => q.merchantId);
    expect(ids(sortQuotes(quotes, "totalCost"))).toEqual([
      "cheap",
      "trusted",
      "fast",
    ]);
    expect(ids(sortQuotes(quotes, "speed"))).toEqual([
      "fast",
      "trusted",
      "cheap",
    ]);
    expect(ids(sortQuotes(quotes, "reputation"))).toEqual([
      "trusted",
      "fast",
      "cheap",
    ]);
    expect(quotes[0]).toBe(fast);
  });

  it("picks a balanced best-value quote", () => {
    expect(pickBestValueQuote([fast, trusted, cheap])?.merchantId).toBe(
      "trusted"
    );
    expect(pickBestValueQuote([])).toBeNull();
  });

  it("prefers escrow support on ties", () => {
    const a = quote({ merchantId: "a", contractEscrowSupported: false });
    const b = quote({ merchantId: "b", contractEscrowSupported: true });
    expect(pickBestValueQuote([a, b])?.merchantId).toBe("b");
  });
});
