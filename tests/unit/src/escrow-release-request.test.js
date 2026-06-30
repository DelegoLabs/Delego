/**
 * Tests for issue #203 — Escrow Release Request Schema
 *
 * Validates that `validateReleaseEscrowRequest` correctly enforces the
 * `ReleaseEscrowRequest` interface shape.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateReleaseEscrowRequest,
} from "../../../apps/backend/payments/dist/src/validation.js";

const VALID_RELEASE = {
  orderId: "order-abc-123",
  escrowId: "escrow-xyz-456",
  deliveryProofId: "proof-789",
  idempotencyKey: "idem-key-release-001",
};

describe("validateReleaseEscrowRequest (issue #203)", () => {
  // ── Success path ──────────────────────────────────────────────────────────

  it("accepts a fully valid release request", () => {
    const result = validateReleaseEscrowRequest(VALID_RELEASE);
    assert.equal(result.ok, true);
    assert.equal(result.value.orderId, VALID_RELEASE.orderId);
    assert.equal(result.value.escrowId, VALID_RELEASE.escrowId);
    assert.equal(result.value.deliveryProofId, VALID_RELEASE.deliveryProofId);
    assert.equal(result.value.idempotencyKey, VALID_RELEASE.idempotencyKey);
  });

  it("trims whitespace from string fields", () => {
    const result = validateReleaseEscrowRequest({
      orderId: "  order-001  ",
      escrowId: "  escrow-001  ",
      deliveryProofId: "  proof-001  ",
      idempotencyKey: "idem-key-trimmed",
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.orderId, "order-001");
    assert.equal(result.value.escrowId, "escrow-001");
    assert.equal(result.value.deliveryProofId, "proof-001");
  });

  // ── Failure paths ─────────────────────────────────────────────────────────

  it("rejects when orderId is missing", () => {
    const { orderId: _omit, ...rest } = VALID_RELEASE;
    const result = validateReleaseEscrowRequest(rest);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /orderId/);
  });

  it("rejects when escrowId is missing", () => {
    const { escrowId: _omit, ...rest } = VALID_RELEASE;
    const result = validateReleaseEscrowRequest(rest);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /escrowId/);
  });

  it("rejects when deliveryProofId is missing", () => {
    const { deliveryProofId: _omit, ...rest } = VALID_RELEASE;
    const result = validateReleaseEscrowRequest(rest);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /deliveryProofId/);
  });

  it("rejects when idempotencyKey is missing", () => {
    const { idempotencyKey: _omit, ...rest } = VALID_RELEASE;
    const result = validateReleaseEscrowRequest(rest);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /idempotencyKey/);
  });

  it("rejects an empty orderId string", () => {
    const result = validateReleaseEscrowRequest({ ...VALID_RELEASE, orderId: "   " });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
  });

  it("rejects an idempotencyKey that is too short (< 8 chars)", () => {
    const result = validateReleaseEscrowRequest({ ...VALID_RELEASE, idempotencyKey: "short" });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /at least/);
  });

  it("rejects an idempotencyKey that is too long (> 128 chars)", () => {
    const result = validateReleaseEscrowRequest({
      ...VALID_RELEASE,
      idempotencyKey: "a".repeat(129),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /at most/);
  });

  it("rejects an idempotencyKey with invalid characters", () => {
    const result = validateReleaseEscrowRequest({
      ...VALID_RELEASE,
      idempotencyKey: "key with spaces!!",
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /invalid characters/);
  });

  it("rejects a completely empty object", () => {
    const result = validateReleaseEscrowRequest({});
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
  });
});
