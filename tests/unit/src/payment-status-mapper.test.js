import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapContractStatusToPaymentStatus } from "../../../apps/backend/payments/dist/src/paymentStatusMapper.js";

describe("mapContractStatusToPaymentStatus", () => {
  it("maps initialized and pending to pending", () => {
    assert.equal(mapContractStatusToPaymentStatus("initialized"), "pending");
    assert.equal(mapContractStatusToPaymentStatus("pending"), "pending");
  });

  it("maps funded and deposited to funded", () => {
    assert.equal(mapContractStatusToPaymentStatus("funded"), "funded");
    assert.equal(mapContractStatusToPaymentStatus("deposited"), "funded");
  });

  it("maps released and completed to released", () => {
    assert.equal(mapContractStatusToPaymentStatus("released"), "released");
    assert.equal(mapContractStatusToPaymentStatus("completed"), "released");
  });

  it("maps refunded and cancelled to refunded", () => {
    assert.equal(mapContractStatusToPaymentStatus("refunded"), "refunded");
    assert.equal(mapContractStatusToPaymentStatus("cancelled"), "refunded");
  });

  it("maps disputed and in_dispute to disputed", () => {
    assert.equal(mapContractStatusToPaymentStatus("disputed"), "disputed");
    assert.equal(mapContractStatusToPaymentStatus("in_dispute"), "disputed");
  });

  it("maps failed, error, and expired to failed", () => {
    assert.equal(mapContractStatusToPaymentStatus("failed"), "failed");
    assert.equal(mapContractStatusToPaymentStatus("error"), "failed");
    assert.equal(mapContractStatusToPaymentStatus("expired"), "failed");
  });

  it("returns failed as safe fallback for unknown status", () => {
    assert.equal(mapContractStatusToPaymentStatus("unknown_state"), "failed");
    assert.equal(mapContractStatusToPaymentStatus(""), "failed");
    assert.equal(mapContractStatusToPaymentStatus("GARBAGE"), "failed");
  });

  it("normalizes uppercase and mixed-case input", () => {
    assert.equal(mapContractStatusToPaymentStatus("FUNDED"), "funded");
    assert.equal(mapContractStatusToPaymentStatus("Released"), "released");
    assert.equal(mapContractStatusToPaymentStatus("  pending  "), "pending");
  });
});
