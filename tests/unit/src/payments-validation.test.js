import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  acquireLock,
  getFundingLock,
  releaseLock,
  validateDepositRequest,
  validateEscrowContractConfig,
  validateIdempotencyKey,
  validateInitializeRequest,
  validateRefundRequest,
  validateReleaseRequest,
  _resetLockRedisClient,
} from "../../../apps/backend/payments/dist/src/validation.js";


const VALID_ADDRESS = "GBBO4ZDDZTSM2GKN4JP4EKBPRXKEHUN36XXH2BHR7J4QKKPOJ7C7LDVF";
const VALID_CONTRACT = "CA7QYNF7SOWQ3JLRS2ZHG7OYBTLZQQLR3WZTAELUIINI7KBZQC3NCJMT";
const OTHER_ADDRESS = "GCEZWKCAJXV7NBX4RNFAF25DFIF3FJ2YLDYLWGYHKXF2WVKCQOL4Y3MP";

describe("payments escrow validation", () => {
  it("rejects initialize request without required fields", () => {
    const result = validateInitializeRequest({});
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
  });

  it("rejects invalid stellar addresses", () => {
    const result = validateInitializeRequest({
      sourceAddress: "not-an-address",
      adminAddress: VALID_ADDRESS,
    });
    assert.equal(result.ok, false);
    assert.match(result.error.message, /valid Stellar account address/);
  });

  it("accepts valid initialize request", () => {
    const result = validateInitializeRequest({
      sourceAddress: VALID_ADDRESS,
      adminAddress: OTHER_ADDRESS,
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.sourceAddress, VALID_ADDRESS);
    assert.equal(result.value.adminAddress, OTHER_ADDRESS);
  });

  it("accepts valid deposit request with optional orderId", () => {
    const result = validateDepositRequest({
      sourceAddress: VALID_ADDRESS,
      buyerAddress: VALID_ADDRESS,
      sellerAddress: OTHER_ADDRESS,
      orderId: "order-123",
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.orderId, "order-123");
  });

  it("rejects deposit request with invalid orderId", () => {
    const result = validateDepositRequest({
      sourceAddress: VALID_ADDRESS,
      buyerAddress: VALID_ADDRESS,
      sellerAddress: OTHER_ADDRESS,
      orderId: "   ",
    });
    assert.equal(result.ok, false);
  });

  it("validates release and refund path escrow IDs", () => {
    const release = validateReleaseRequest({ sourceAddress: VALID_ADDRESS }, "42");
    assert.equal(release.ok, true);
    assert.equal(release.value.escrowId, "42");

    const invalid = validateRefundRequest(
      { sourceAddress: VALID_ADDRESS, refundReasonCode: "timeout" },
      "-1"
    );
    assert.equal(invalid.ok, false);

    const missing = validateRefundRequest(
      { sourceAddress: VALID_ADDRESS, refundReasonCode: "timeout" },
      ""
    );
    assert.equal(missing.ok, false);
  });

  it("accepts valid refundReasonCode values", () => {
    const codes = [
      "timeout",
      "buyer_cancelled",
      "merchant_cancelled",
      "dispute_buyer",
      "system_error",
    ];

    for (const code of codes) {
      const result = validateRefundRequest(
        { sourceAddress: VALID_ADDRESS, refundReasonCode: code },
        "42"
      );
      assert.equal(result.ok, true);
      assert.equal(result.value.escrowId, "42");
      assert.equal(result.value.refundReasonCode, code);
    }
  });

  it("rejects missing refundReasonCode", () => {
    const result = validateRefundRequest({ sourceAddress: VALID_ADDRESS }, "42");
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
  });

  it("rejects invalid refundReasonCode", () => {
    const result = validateRefundRequest(
      { sourceAddress: VALID_ADDRESS, refundReasonCode: "late" },
      "42"
    );
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /Invalid refundReasonCode/);
  });


  it("reports missing ESCROW_CONTRACT_ID config", () => {
    const original = process.env.ESCROW_CONTRACT_ID;
    delete process.env.ESCROW_CONTRACT_ID;

    const result = validateEscrowContractConfig();
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "CONFIG_ERROR");

    if (original !== undefined) {
      process.env.ESCROW_CONTRACT_ID = original;
    }
  });

  it("accepts valid ESCROW_CONTRACT_ID config", () => {
    process.env.ESCROW_CONTRACT_ID = VALID_CONTRACT;
    const result = validateEscrowContractConfig();
    assert.equal(result.ok, true);
    assert.equal(result.value, VALID_CONTRACT);
  });
});

describe("validateIdempotencyKey", () => {
  it("rejects missing Idempotency-Key header", () => {
    const result = validateIdempotencyKey({}, "/escrow/deposit");
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "MISSING_IDEMPOTENCY_KEY");
  });

  it("rejects key shorter than minimum length (5 chars)", () => {
    const result = validateIdempotencyKey({ "idempotency-key": "short" }, "/escrow/deposit");
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /at least/);
  });

  it("rejects key of exactly 7 characters (one below minimum)", () => {
    const result = validateIdempotencyKey({ "idempotency-key": "a".repeat(7) }, "/escrow/deposit");
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
  });

  it("accepts key of exactly 8 characters (minimum boundary)", () => {
    const result = validateIdempotencyKey({ "idempotency-key": "a".repeat(8) }, "/escrow/deposit");
    assert.equal(result.ok, true);
  });

  it("accepts key of exactly 128 characters (maximum boundary)", () => {
    const result = validateIdempotencyKey({ "idempotency-key": "a".repeat(128) }, "/escrow/deposit");
    assert.equal(result.ok, true);
  });

  it("rejects key longer than maximum length (129 chars)", () => {
    const longKey = "a".repeat(129);
    const result = validateIdempotencyKey({ "idempotency-key": longKey }, "/escrow/deposit");
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /at most/);
  });

  it("rejects key with invalid characters", () => {
    const result = validateIdempotencyKey({ "idempotency-key": "key with spaces" }, "/escrow/deposit");
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.match(result.error.message, /invalid characters/);
  });

  it("accepts a valid Idempotency-Key and returns context", () => {
    const result = validateIdempotencyKey(
      { "idempotency-key": "valid-idempotency-key-12345" },
      "/escrow/deposit",
      "user-42"
    );
    assert.equal(result.ok, true);
    assert.equal(result.value.key, "valid-idempotency-key-12345");
    assert.equal(result.value.route, "/escrow/deposit");
    assert.equal(result.value.userId, "user-42");
  });

  it("accepts header with uppercase name Idempotency-Key", () => {
    const result = validateIdempotencyKey(
      { "Idempotency-Key": "valid-key-uppercase" },
      "/escrow/release"
    );
    assert.equal(result.ok, true);
    assert.equal(result.value.key, "valid-key-uppercase");
  });
});

describe("EscrowFundingLock mechanisms", () => {
  it("acquires lock successfully for valid order", async () => {
    _resetLockRedisClient();
    const orderId = "order-unit-101";
    const acquired = await acquireLock(orderId, 10000);
    assert.equal(acquired, true);

    const lock = getFundingLock(orderId);
    assert.ok(lock);
    assert.equal(lock.orderId, orderId);
    assert.equal(lock.ttlMs, 10000);
    assert.ok(lock.lockToken);
    assert.ok(lock.createdAt > 0);
  });

  it("blocks concurrent lock requests for the same order", async () => {
    _resetLockRedisClient();
    const orderId = "order-unit-102";
    const first = await acquireLock(orderId, 10000);
    assert.equal(first, true);

    const second = await acquireLock(orderId, 10000);
    assert.equal(second, false);
  });

  it("releases lock cleanly on completion", async () => {
    _resetLockRedisClient();
    const orderId = "order-unit-103";
    const acquired = await acquireLock(orderId, 10000);
    assert.equal(acquired, true);

    await releaseLock(orderId);
    assert.equal(getFundingLock(orderId), null);

    const reacquired = await acquireLock(orderId, 10000);
    assert.equal(reacquired, true);
  });

  it("automatically expires lock after TTL timeout", async () => {
    _resetLockRedisClient();
    const orderId = "order-unit-104";
    const ttlMs = 40;
    const acquired = await acquireLock(orderId, ttlMs);
    assert.equal(acquired, true);

    assert.equal(await acquireLock(orderId, ttlMs), false);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const reacquire = await acquireLock(orderId, ttlMs);
    assert.equal(reacquire, true);
  });
});

