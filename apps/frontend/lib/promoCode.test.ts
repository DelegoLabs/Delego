import { describe, expect, it, vi, beforeEach } from "vitest";
import { apiFetch } from "./apiFetch";
import {
  calculatePromoDiscount,
  formatPromoStroops,
  validatePromoCode,
} from "./promoCode";
import { partitionCartByMerchant } from "./cartPartition";
import type { CartItem } from "./cart";

vi.mock("./apiFetch", () => ({ apiFetch: vi.fn() }));
const request = {
  code: "SUMMER10",
  merchantId: "one",
  subtotalStroops: "1000",
  items: [],
};
const percentage = {
  code: "SUMMER10",
  discountType: "percentage" as const,
  discountValue: 10,
  appliedDiscountStroops: "100",
};

describe("promo code money", () => {
  it.each([
    ["1000", 10, "100"],
    ["999", 12.5, "124"],
    ["90071992547409931", 10, "9007199254740993"],
  ])(
    "calculates %s Stroops at %s percent exactly",
    (subtotal, value, expected) => {
      expect(
        calculatePromoDiscount(subtotal, {
          discountType: "percentage",
          discountValue: value,
        })
      ).toBe(expected);
    }
  );
  it("caps fixed discounts at the merchant subtotal", () => {
    expect(
      calculatePromoDiscount("90", {
        discountType: "fixed_stroops",
        discountValue: 100,
      })
    ).toBe("90");
  });
  it("checks the minimum including its exact boundary", () => {
    expect(
      calculatePromoDiscount("1000", { ...percentage, minOrderStroops: "1000" })
    ).toBe("100");
    expect(() =>
      calculatePromoDiscount("999", { ...percentage, minOrderStroops: "1000" })
    ).toThrow("minimum");
  });
  it.each([0, -1, NaN, Infinity, 101])(
    "rejects invalid percentage %s",
    (discountValue) => {
      expect(() =>
        calculatePromoDiscount("1000", { ...percentage, discountValue })
      ).toThrow();
    }
  );
  it("rejects unsafe fixed amounts and malformed money", () => {
    expect(() =>
      calculatePromoDiscount("1000", {
        discountType: "fixed_stroops",
        discountValue: Number.MAX_SAFE_INTEGER + 1,
      })
    ).toThrow();
    expect(() => calculatePromoDiscount("-1", percentage)).toThrow();
    expect(() => calculatePromoDiscount("1.2", percentage)).toThrow();
  });
  it("formats large amounts without dropping Stroops", () => {
    expect(formatPromoStroops("90071992547409931")).toBe(
      `${9007199254n.toLocaleString()}.7409931 XLM`
    );
  });
});

describe("coupon verification endpoint", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());
  it("POSTs the merchant quote and forwards cancellation", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: percentage, error: null });
    const controller = new AbortController();
    await expect(
      validatePromoCode(request, controller.signal)
    ).resolves.toEqual(percentage);
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/coupons/validate", {
      method: "POST",
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  });
  it.each(["Invalid coupon code.", "This coupon has expired."])(
    "preserves backend rejection: %s",
    async (message) => {
      vi.mocked(apiFetch).mockResolvedValue({
        data: null,
        error: { code: "INVALID_COUPON", message },
      });
      await expect(validatePromoCode(request)).rejects.toThrow(message);
    }
  );
  it.each([
    null,
    { ...percentage, appliedDiscountStroops: "101" },
    { ...percentage, appliedDiscountStroops: "-100" },
    { ...percentage, code: "OTHER" },
    { ...percentage, discountValue: "10" },
    { ...percentage, minOrderStroops: "1001" },
  ])("rejects an unverifiable response", async (data) => {
    vi.mocked(apiFetch).mockResolvedValue({ data, error: null });
    await expect(validatePromoCode(request)).rejects.toThrow();
  });
});

it("carries the discount only into the selected merchant's escrow partition", () => {
  const item: CartItem = {
    productId: "a",
    merchantId: "one",
    merchantName: "One",
    payoutAddress: "G1",
    title: "Tea",
    priceStroops: "1000",
    quantity: 1,
    maxStock: 10,
  };
  const partitions = partitionCartByMerchant(
    [item, { ...item, productId: "b", merchantId: "two" }],
    {
      merchantId: "one",
      discount: percentage,
    }
  );
  expect(partitions.map((part) => part.subtotalStroops)).toEqual([
    "900",
    "1000",
  ]);
  expect(partitions[0].promoCodeDiscount?.code).toBe("SUMMER10");
  expect(partitions[1].promoCodeDiscount).toBeUndefined();
});
