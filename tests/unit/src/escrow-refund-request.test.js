/**
 * Tests for issue #204 — Escrow Refund Request Schema
 *
 * Validates that `validateRefundEscrowRequest` correctly enforces the
 * `RefundEscrowRequest` interface shape, including reason-code validation.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateRefundEscrowRequest,
  SUPPORTED_REFUND_REASONS,
} from "../../../apps/backend/payments/dist/src/validation.js";

const VALID_REFUND = {
  orderId: "order-abc-123",
  escrowId: "escrow-xyz-456",
  reasonCode: "item_not_received",
  idempotencyKey: "idem-key-refund-001",
};

describe("validateRefundEscrowRequest (issue #204)", () => {
  // ── Success paths ─────────────────────────────────────────────────────────

  it("accepts a fully valid refund request", () => {
    const result = validateRefundEscrowRequest(VALID_REFUND);
    assert.equal(result.ok, true);
    assert.equal(result.value.orderId, VALID_REFUND.orderId);
    assert.equal(result.value.escrowId, VALID_REFUND.escrowId);
    assert.equal(result.value.reasonCode, VALID_REFUND.reasonCode);
    assert.equal(result.value.idempotencyKey, VALID_REFUND.idempotencyKey);
  });

  it("accepts every supported reason code", () => {
    for (const reasonCode of SUPPORTED_REFUND_REASONS) {
      const result = validateRefundEscrowRequest({ ...VALID_REFUND, reasonCode });
      assert.equal(result.ok, true, `Expected ok=true for reasonCode="${reasonCode}"`);
      assert.equal(result.value.reasonCode, reasonCode);
    }
  });

  it("trims whitespace from string fields", () => {
    const result = validateRefundEscrowRequest({
      orderId: "  order-002  ",
      escrowId: "  escrow-002  ",
      reasonCode: "order_cancelled",
      idempotencyKey: "idem-key-trimtest",
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.orderId, "order-002");
    assert.equal(result.value.escrowId, "escrow-002");
  });

  // ── Failure paths ─────────────────────────────────────────────────────────

  it("rejects when orderId is missing", () => {
    const { orderId: _omit, ...rest } = VALID_REFUND;
    const result = validateRefundEscrowRequest(rest);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /orderId/);
  });

  it("rejects when escrowId is missing", () => {
    const { escrowId: _omit, ...rest } = VALID_REFUND;
    const result = validateRefundEscrowRequest(rest);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /escrowId/);
  });

  it("rejects when reasonCode is missing", () => {
    const { reasonCode: _omit, ...rest } = VALID_REFUND;
    const result = validateRefundEscrowRequest(rest);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /reasonCode/);
  });

  it("rejects an unsupported reason code", () => {
    const result = validateRefundEscrowRequest({
      ...VALID_REFUND,
      reasonCode: "i_just_want_money_back",
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /reasonCode must be one of/);
  });

  it("rejects an empty reason code string", () => {
    const result = validateRefundEscrowRequest({ ...VALID_REFUND, reasonCode: "  " });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
  });

  it("rejects when idempotencyKey is missing", () => {
    const { idempotencyKey: _omit, ...rest } = VALID_REFUND;
    const result = validateRefundEscrowRequest(rest);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /idempotencyKey/);
  });

  it("rejects an idempotencyKey that is too short (< 8 chars)", () => {
    const result = validateRefundEscrowRequest({ ...VALID_REFUND, idempotencyKey: "short" });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /at least/);
  });

  it("rejects an idempotencyKey that is too long (> 128 chars)", () => {
    const result = validateRefundEscrowRequest({
      ...VALID_REFUND,
      idempotencyKey: "a".repeat(129),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /at most/);
  });

  it("rejects a completely empty object", () => {
    const result = validateRefundEscrowRequest({});
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
  });
});

describe("SUPPORTED_REFUND_REASONS constant (issue #204)", () => {
  it("is a non-empty array", () => {
    assert.ok(Array.isArray(SUPPORTED_REFUND_REASONS));
    assert.ok(SUPPORTED_REFUND_REASONS.length > 0);
  });

  it("includes item_not_received as a valid reason", () => {
    assert.ok(SUPPORTED_REFUND_REASONS.includes("item_not_received"));
  });

  it("includes fraudulent as a valid reason", () => {
    assert.ok(SUPPORTED_REFUND_REASONS.includes("fraudulent"));
  });
});
