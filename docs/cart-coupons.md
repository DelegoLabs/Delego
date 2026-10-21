# Cart promo codes

The cart drawer validates one promo code at a time. For a mixed-merchant
cart, the buyer selects the merchant whose order receives the discount.
The displayed subtotal and that merchant's checkout partition both use
the discounted amount; other merchants' amounts are unchanged.

Applying, replacing or removing a code never changes product prices.
Changing cart contents, prices, quantities or the selected merchant
invalidates the quote. In-flight responses for an older cart are ignored.
Codes are not saved to local storage. Checkout is disabled while a
validation request is pending.

## Gateway contract

The frontend sends `POST /api/v1/coupons/validate` through the existing
`apiFetch` helper, using `NEXT_PUBLIC_API_URL`:

```json
{
  "code": "SUMMER10",
  "merchantId": "tea-shop",
  "subtotalStroops": "100000000",
  "items": [
    { "productId": "tea", "quantity": 1, "priceStroops": "100000000" }
  ]
}
```

Only the selected merchant's items and subtotal are sent. The expected
success response uses the application's existing `ApiResponse` envelope:

```json
{
  "data": {
    "code": "SUMMER10",
    "discountType": "percentage",
    "discountValue": 10,
    "minOrderStroops": "50000000",
    "appliedDiscountStroops": "10000000"
  },
  "error": null
}
```

Rejections use `data: null` and an `error` containing `code` and `message`,
for example `COUPON_EXPIRED` / `This coupon has expired.` Network failures
show a retryable message; malformed or inconsistent quotes are rejected.
The endpoint was specified by issue #965 but is not in this repository's
generated API schema. This document records the frontend integration
contract; automated and browser verification use mocked responses.

All monetary calculation uses integer `BigInt` Stroops. Percentage
discounts are rounded down to a whole Stroop. Fixed discounts use positive
safe integer `discountValue` values, as required by its numeric schema,
and are capped at the merchant subtotal. The server-reported applied
amount must match the calculation. A minimum order applies to the
selected merchant's subtotal, not to the combined cart.

## Checkout integration

`partitionCartByMerchant` accepts the validated merchant coupon and
includes `promoCodeDiscount` in the discounted partition passed to
`signEscrow`. The current default signer in `MultiMerchantCheckout` remains
a development mock. No wallet transaction or live redemption is performed
by coupon validation. A production signer/order service must revalidate
coupon eligibility, expiry, usage limits and authoritative product prices
before creating an order; frontend values are not payment authorization.
