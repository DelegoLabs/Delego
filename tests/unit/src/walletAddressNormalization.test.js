import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { normalizeStellarAddress } from "../../../apps/backend/wallet/dist/src/normalizeStellarAddress.js";

const validKeypair = Keypair.random();
const VALID_PUBLIC_KEY = validKeypair.publicKey();
const VALID_SECRET_KEY = validKeypair.secret();
const INVALID_KEY = "GTX0000000000000000000000000000000000000000000000000000";
const LOWERCASE_KEY = VALID_PUBLIC_KEY.toLowerCase();

describe("normalizeStellarAddress", () => {
  it("trims surrounding whitespace from valid addresses", () => {
    const padded = `  ${VALID_PUBLIC_KEY}  `;
    const result = normalizeStellarAddress(padded);

    assert.equal(result.original, padded);
    assert.equal(result.normalized, VALID_PUBLIC_KEY);
    assert.equal(result.valid, true);
  });

  it("accepts a valid G-address", () => {
    const result = normalizeStellarAddress(VALID_PUBLIC_KEY);

    assert.equal(result.original, VALID_PUBLIC_KEY);
    assert.equal(result.normalized, VALID_PUBLIC_KEY);
    assert.equal(result.valid, true);
  });

  it("rejects lowercase StrKey values", () => {
    const result = normalizeStellarAddress(LOWERCASE_KEY);

    assert.equal(result.original, LOWERCASE_KEY);
    assert.equal(result.normalized, LOWERCASE_KEY);
    assert.equal(result.valid, false);
  });

  it("rejects secret S-addresses", () => {
    const result = normalizeStellarAddress(VALID_SECRET_KEY);

    assert.equal(result.valid, false);
    assert.equal(result.normalized, VALID_SECRET_KEY);
  });

  it("rejects malformed and empty addresses", () => {
    assert.deepEqual(normalizeStellarAddress(""), {
      original: "",
      normalized: "",
      valid: false,
    });
    assert.deepEqual(normalizeStellarAddress("   "), {
      original: "   ",
      normalized: "",
      valid: false,
    });

    const invalid = normalizeStellarAddress(INVALID_KEY);
    assert.equal(invalid.valid, false);
    assert.equal(invalid.normalized, INVALID_KEY);
  });
});
