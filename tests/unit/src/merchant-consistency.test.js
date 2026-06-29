/**
 * Tests for issue #202 — Merchant Address Consistency Check
 *
 * Validates that merchant addresses are normalized before comparison and that
 * mismatches are rejected before wallet submission.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkMerchantConsistency,
  validateMerchantConsistency,
} from "../../../apps/backend/payments/dist/src/validation.js";

const MERCHANT_A = "GBBO4ZDDZTSM2GKN4JP4EKBPRXKEHUN36XXH2BHR7J4QKKPOJ7C7LDVF";
const MERCHANT_B = "GCEZWKCAJXV7NBX4RNFAF25DFIF3FJ2YLDYLWGYHKXF2WVKCQOL4Y3MP";
const ORDER_ID = "order-merchant-check-001";

describe("checkMerchantConsistency (issue #202)", () => {
  it("reports an exact match when addresses are identical", () => {
    const result = checkMerchantConsistency(ORDER_ID, MERCHANT_A, MERCHANT_A);

    assert.equal(result.orderId, ORDER_ID);
    assert.equal(result.expectedMerchant, MERCHANT_A);
    assert.equal(result.requestedMerchant, MERCHANT_A);
    assert.equal(result.matches, true);
  });

  it("reports a normalized match when addresses differ only by whitespace", () => {
    const padded = `  ${MERCHANT_A}  `;
    const result = checkMerchantConsistency(ORDER_ID, MERCHANT_A, padded);

    assert.equal(result.expectedMerchant, MERCHANT_A);
    assert.equal(result.requestedMerchant, MERCHANT_A);
    assert.equal(result.matches, true);
  });

  it("reports a mismatch when addresses differ", () => {
    const result = checkMerchantConsistency(ORDER_ID, MERCHANT_A, MERCHANT_B);

    assert.equal(result.expectedMerchant, MERCHANT_A);
    assert.equal(result.requestedMerchant, MERCHANT_B);
    assert.equal(result.matches, false);
  });
});

describe("validateMerchantConsistency (issue #202)", () => {
  it("accepts an exact merchant address match", () => {
    const result = validateMerchantConsistency(ORDER_ID, MERCHANT_A, MERCHANT_A);

    assert.equal(result.ok, true);
    assert.equal(result.value.matches, true);
    assert.equal(result.value.expectedMerchant, MERCHANT_A);
    assert.equal(result.value.requestedMerchant, MERCHANT_A);
  });

  it("accepts a normalized merchant address match", () => {
    const result = validateMerchantConsistency(
      ORDER_ID,
      `  ${MERCHANT_A}`,
      `${MERCHANT_A}  `
    );

    assert.equal(result.ok, true);
    assert.equal(result.value.matches, true);
    assert.equal(result.value.expectedMerchant, MERCHANT_A);
    assert.equal(result.value.requestedMerchant, MERCHANT_A);
  });

  it("rejects a merchant address mismatch before wallet submission", () => {
    const result = validateMerchantConsistency(ORDER_ID, MERCHANT_A, MERCHANT_B);

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "MERCHANT_ADDRESS_MISMATCH");
    assert.match(
      result.error.message,
      /does not match the merchant stored for the order/
    );
    assert.equal(result.error.details.orderId, ORDER_ID);
    assert.equal(result.error.details.expectedMerchant, MERCHANT_A);
    assert.equal(result.error.details.requestedMerchant, MERCHANT_B);
    assert.equal(result.error.details.field, "merchantAddress");
  });
});
