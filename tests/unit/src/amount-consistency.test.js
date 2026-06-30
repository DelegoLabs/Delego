/**
 * Tests for Order Amount Consistency Check
 *
 * Validates that stroops amounts are normalized before comparison and that
 * mismatches are rejected before wallet submission.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkAmountConsistency,
  validateAmountConsistency,
} from "../../../apps/backend/payments/dist/src/validation.js";

const ORDER_ID = "order-amount-check-001";
const AMOUNT_10_XLM = "100000000";
const AMOUNT_5_XLM = "50000000";

describe("checkAmountConsistency", () => {
  it("reports an exact match when amounts are identical", () => {
    const result = checkAmountConsistency(ORDER_ID, AMOUNT_10_XLM, AMOUNT_10_XLM);

    assert.equal(result.orderId, ORDER_ID);
    assert.equal(result.expectedStroops, AMOUNT_10_XLM);
    assert.equal(result.requestedStroops, AMOUNT_10_XLM);
    assert.equal(result.matches, true);
  });

  it("reports a normalized match when amounts differ only by whitespace or leading zeros", () => {
    const padded = `  ${AMOUNT_10_XLM}  `;
    const leadingZeros = `0${AMOUNT_10_XLM}`;
    const result = checkAmountConsistency(ORDER_ID, padded, leadingZeros);

    assert.equal(result.expectedStroops, AMOUNT_10_XLM);
    assert.equal(result.requestedStroops, AMOUNT_10_XLM);
    assert.equal(result.matches, true);
  });

  it("reports a mismatch when amounts differ", () => {
    const result = checkAmountConsistency(ORDER_ID, AMOUNT_10_XLM, AMOUNT_5_XLM);

    assert.equal(result.expectedStroops, AMOUNT_10_XLM);
    assert.equal(result.requestedStroops, AMOUNT_5_XLM);
    assert.equal(result.matches, false);
  });
});

describe("validateAmountConsistency", () => {
  it("accepts an exact amount match", () => {
    const result = validateAmountConsistency(ORDER_ID, AMOUNT_10_XLM, AMOUNT_10_XLM);

    assert.equal(result.ok, true);
    assert.equal(result.value.matches, true);
    assert.equal(result.value.expectedStroops, AMOUNT_10_XLM);
    assert.equal(result.value.requestedStroops, AMOUNT_10_XLM);
  });

  it("accepts a normalized amount match", () => {
    const result = validateAmountConsistency(
      ORDER_ID,
      `  ${AMOUNT_10_XLM}`,
      `0${AMOUNT_10_XLM}  `
    );

    assert.equal(result.ok, true);
    assert.equal(result.value.matches, true);
    assert.equal(result.value.expectedStroops, AMOUNT_10_XLM);
    assert.equal(result.value.requestedStroops, AMOUNT_10_XLM);
  });

  it("rejects an amount mismatch before wallet submission", () => {
    const result = validateAmountConsistency(ORDER_ID, AMOUNT_10_XLM, AMOUNT_5_XLM);

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "ORDER_AMOUNT_MISMATCH");
    assert.match(
      result.error.message,
      /does not match the order amount stored for the order/
    );
    assert.equal(result.error.details.orderId, ORDER_ID);
    assert.equal(result.error.details.expectedStroops, AMOUNT_10_XLM);
    assert.equal(result.error.details.requestedStroops, AMOUNT_5_XLM);
    assert.equal(result.error.details.field, "amountStroops");
  });
});
