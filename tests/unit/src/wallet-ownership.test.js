import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { generateToken } from "../../../apps/backend/gateway/dist/src/auth/authService.js";
import {
  checkWalletOwnership,
  requireWalletOwnership,
} from "../../../apps/backend/gateway/dist/middleware/walletOwnership.js";
import { Wallet } from "../../../apps/backend/gateway/dist/src/models/Wallet.js";

const OWNER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const OTHER_USER_ID = "b1ffcd00-0d1c-4ef9-bc7e-7cc0cd491b22";
const WALLET_ID = "c2ggde11-1e2d-6gh0-dd8f-8dd1de502c33";

describe("Gateway wallet ownership guard (issue #191)", () => {
  let originalFindByPk;

  beforeEach(() => {
    originalFindByPk = Wallet.findByPk;
  });

  afterEach(() => {
    Wallet.findByPk = originalFindByPk;
  });

  it("returns owned=true when the wallet belongs to the user", async () => {
    Wallet.findByPk = async () => ({ id: WALLET_ID, userId: OWNER_ID });

    const result = await checkWalletOwnership(OWNER_ID, WALLET_ID);
    assert.deepEqual(result, { userId: OWNER_ID, walletId: WALLET_ID, owned: true });
  });

  it("returns owned=false when the wallet belongs to another user", async () => {
    Wallet.findByPk = async () => ({ id: WALLET_ID, userId: OTHER_USER_ID });

    const result = await checkWalletOwnership(OWNER_ID, WALLET_ID);
    assert.deepEqual(result, { userId: OWNER_ID, walletId: WALLET_ID, owned: false });
  });

  it("returns owned=false when the wallet is missing", async () => {
    Wallet.findByPk = async () => null;

    const result = await checkWalletOwnership(OWNER_ID, WALLET_ID);
    assert.deepEqual(result, { userId: OWNER_ID, walletId: WALLET_ID, owned: false });
  });

  it("allows the owner through requireWalletOwnership", async () => {
    Wallet.findByPk = async () => ({ id: WALLET_ID, userId: OWNER_ID });

    const token = generateToken(OWNER_ID);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createMockResponse();

    const allowed = await requireWalletOwnership(req, res, WALLET_ID);
    assert.equal(allowed, true);
    assert.equal(res.status, 0);
  });

  it("returns AUTHORIZATION_ERROR for a non-owner", async () => {
    Wallet.findByPk = async () => ({ id: WALLET_ID, userId: OTHER_USER_ID });

    const token = generateToken(OWNER_ID);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createMockResponse();

    const allowed = await requireWalletOwnership(req, res, WALLET_ID);
    assert.equal(allowed, false);
    assert.equal(res.status, 403);
    assert.equal(res.parsedBody.error.code, "AUTHORIZATION_ERROR");
  });

  it("returns NOT_FOUND for a missing wallet", async () => {
    Wallet.findByPk = async () => null;

    const token = generateToken(OWNER_ID);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createMockResponse();

    const allowed = await requireWalletOwnership(req, res, WALLET_ID);
    assert.equal(allowed, false);
    assert.equal(res.status, 404);
    assert.equal(res.parsedBody.error.code, "NOT_FOUND");
  });
});

function createMockResponse() {
  let statusCode = 0;
  let body = null;
  return {
    writeHead(status) {
      statusCode = status;
    },
    setHeader() {},
    end(payload) {
      body = JSON.parse(payload);
    },
    get status() {
      return statusCode;
    },
    get parsedBody() {
      return body;
    },
  };
}
