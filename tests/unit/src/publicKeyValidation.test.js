import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import * as Utils from "@delego/utils";

const validKeypair = Keypair.random();
const VALID_PUBLIC_KEY = validKeypair.publicKey();
const VALID_SECRET_KEY = validKeypair.secret();
const INVALID_KEY = "GTX0000000000000000000000000000000000000000000000000000";
const SHORT_KEY = "GBBO4ZDDZTSM2GKN4JP4EKBPRXKEHUN36XXH2BHR7J4QKKPOJ7C";

function createMockRes() {
  const writes = [];
  return {
    writableEnded: false,
    writeHead(status, _headers) {
      writes.push({ status });
    },
    end(body) {
      writes.push({ body });
      this.writableEnded = true;
    },
    getWrites() {
      return writes;
    },
  };
}

describe("Stellar public key validation", () => {
  it("returns true for valid G-addresses", () => {
    assert.equal(Utils.isValidStellarPublicKey(VALID_PUBLIC_KEY), true);
  });

  it("returns false for secret S-addresses", () => {
    assert.equal(Utils.isValidStellarPublicKey(VALID_SECRET_KEY), false);
  });

  it("returns false for invalid key lengths", () => {
    assert.equal(Utils.isValidStellarPublicKey(SHORT_KEY), false);
    assert.equal(Utils.isValidStellarPublicKey(INVALID_KEY), false);
  });

  it("validatePublicKey returns the correct error codes", () => {
    assert.deepEqual(Utils.validatePublicKey(""), { valid: false, error: "missing" });
    assert.deepEqual(Utils.validatePublicKey(VALID_SECRET_KEY), { valid: false, error: "secret_key_not_allowed" });
    assert.deepEqual(Utils.validatePublicKey(INVALID_KEY), { valid: false, error: "invalid_strkey" });
    assert.deepEqual(Utils.validatePublicKey(VALID_PUBLIC_KEY), { valid: true, normalized: VALID_PUBLIC_KEY });
  });

  it("middleware blocks malformed public key params", async () => {
    const res = createMockRes();
    const middleware = Utils.validatePublicKeyMiddleware("address");
    await middleware({}, res, { address: INVALID_KEY });

    assert.equal(res.writableEnded, true);
    const writes = res.getWrites();
    assert.equal(writes.length, 2);
    assert.equal(writes[0].status, 400);
    const body = JSON.parse(writes[1].body);
    assert.equal(body.error.code, "BAD_REQUEST");
    assert.equal(body.error.message, "Malformed Stellar public key address");
  });
});
