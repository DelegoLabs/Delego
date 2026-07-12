import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateMemo,
  MemoValidationError,
  transactionService,
} from "../../../apps/backend/wallet/dist/transactions/index.js";

describe("Wallet transaction memo validation (issue #199)", () => {
  it("accepts a valid text memo within the Stellar byte limit", () => {
    const result = validateMemo("Deposit escrow for order 42");
    assert.equal(result.valid, true);
    assert.equal(result.type, "text");
  });

  it("accepts an absent memo as type none", () => {
    const result = validateMemo(undefined);
    assert.deepEqual(result, { valid: true, type: "none" });
  });

  it("rejects memos that exceed the 28-byte text limit", () => {
    const result = validateMemo("this memo is definitely too long for stellar");
    assert.equal(result.valid, false);
    assert.equal(result.type, "text");
    assert.match(result.error, /28 byte/);
  });

  it("rejects memos that look like secret keys", () => {
    const result = validateMemo("SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB7");
    assert.equal(result.valid, false);
    assert.match(result.error, /secret key/);
  });

  it("accepts numeric id memos", () => {
    const result = validateMemo("42");
    assert.deepEqual(result, { valid: true, type: "id" });
  });

  it("throws MemoValidationError when simulate receives an invalid memo", async () => {
    await assert.rejects(
      transactionService.simulate({
        sourceAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAITA4",
        method: "initialize",
        args: [],
        memo: "this memo is definitely too long for stellar",
      }),
      MemoValidationError
    );
  });
});
