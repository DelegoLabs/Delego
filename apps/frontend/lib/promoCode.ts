import { apiFetch } from "./apiFetch";
import type { CartItem } from "./cart";

export interface PromoCodeDiscount {
  code: string;
  discountType: "percentage" | "fixed_stroops";
  discountValue: number;
  minOrderStroops?: string;
  appliedDiscountStroops: string;
}

export interface AppliedPromoCode {
  merchantId: string;
  discount: PromoCodeDiscount;
}

function stroops(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(
      "The coupon service returned an invalid amount. Please try again."
    );
  }
  return BigInt(value);
}

/** Round percentage discounts down to whole Stroops; never discount below zero. */
export function calculatePromoDiscount(
  subtotalStroops: string,
  discount: Pick<
    PromoCodeDiscount,
    "discountType" | "discountValue" | "minOrderStroops"
  >
): string {
  const subtotal = stroops(subtotalStroops);
  if (
    discount.minOrderStroops !== undefined &&
    subtotal < stroops(discount.minOrderStroops)
  ) {
    throw new Error(
      "This merchant's order does not meet the coupon's minimum order amount."
    );
  }
  const value = discount.discountValue;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("The coupon service returned an invalid discount.");
  }
  let amount: bigint;
  if (discount.discountType === "fixed_stroops") {
    if (!Number.isSafeInteger(value)) {
      throw new Error("The coupon service returned an invalid fixed discount.");
    }
    amount = BigInt(value);
  } else if (discount.discountType === "percentage") {
    // Parse the decimal representation rather than multiplying a large
    // monetary amount by a floating-point percentage.
    const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
    if (!match || value > 100) {
      throw new Error("The coupon service returned an invalid percentage.");
    }
    const fraction = match[2] ?? "";
    const numerator = BigInt(match[1] + fraction);
    amount = (subtotal * numerator) / (100n * 10n ** BigInt(fraction.length));
  } else {
    throw new Error("The coupon service returned an unsupported discount.");
  }
  return (amount > subtotal ? subtotal : amount).toString();
}

/** Preserve all seven Stroop decimals without converting money to Number. */
export function formatPromoStroops(value: string): string {
  const amount = stroops(value);
  const whole = amount / 10_000_000n;
  const fraction = (amount % 10_000_000n)
    .toString()
    .padStart(7, "0")
    .replace(/0+$/, "");
  return `${whole.toLocaleString()}${fraction ? `.${fraction}` : ""} XLM`;
}

export interface ValidatePromoCodeRequest {
  code: string;
  merchantId: string;
  subtotalStroops: string;
  items: Pick<CartItem, "productId" | "quantity" | "priceStroops">[];
}

/** The server owns eligibility/expiry; a client calculation alone never applies a code. */
export async function validatePromoCode(
  request: ValidatePromoCodeRequest,
  signal?: AbortSignal
): Promise<PromoCodeDiscount> {
  const response = await apiFetch<unknown>("/api/v1/coupons/validate", {
    method: "POST",
    body: JSON.stringify(request),
    signal,
  });
  if (response.error) {
    throw new Error(
      response.error.message || "This coupon is invalid or has expired."
    );
  }
  const data = response.data;
  if (!data || typeof data !== "object") {
    throw new Error("The coupon service returned an invalid response.");
  }
  const candidate = data as Record<string, unknown>;
  if (
    typeof candidate.code !== "string" ||
    candidate.code.trim().toUpperCase() !== request.code.trim().toUpperCase() ||
    (candidate.discountType !== "percentage" &&
      candidate.discountType !== "fixed_stroops") ||
    typeof candidate.discountValue !== "number" ||
    (candidate.minOrderStroops !== undefined &&
      typeof candidate.minOrderStroops !== "string")
  ) {
    throw new Error("The coupon service returned an invalid response.");
  }
  const discount: PromoCodeDiscount = {
    code: candidate.code.trim(),
    discountType: candidate.discountType,
    discountValue: candidate.discountValue,
    minOrderStroops: candidate.minOrderStroops as string | undefined,
    appliedDiscountStroops: stroops(
      candidate.appliedDiscountStroops
    ).toString(),
  };
  const calculated = calculatePromoDiscount(request.subtotalStroops, discount);
  if (discount.appliedDiscountStroops !== calculated || calculated === "0") {
    throw new Error(
      "The coupon amount could not be verified. Please try again."
    );
  }
  return discount;
}
