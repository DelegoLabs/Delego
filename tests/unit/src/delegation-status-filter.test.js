import { describe, it, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "../../..");

// ── Mock auth and DB before importing the handler ────────────────────────────

await mock.module(`${root}/apps/backend/gateway/dist/middleware/auth.js`, {
  namedExports: {
    extractAuth: () => ({ userId: "user-1", token: "valid-token" }),
  },
});

await mock.module(`${root}/apps/backend/gateway/dist/src/models/index.js`, {
  namedExports: {
    Delegation: { findAll: async () => [] },
    DelegationPolicy: {},
    SpendLimit: {},
    PermissionLevel: {},
    Wallet: {},
  },
});

const { listDelegationsHandler } = await import(
  `${root}/apps/backend/gateway/dist/routes/delegations.js`
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(url) {
  return {
    url,
    headers: { host: "localhost", authorization: "Bearer valid-token" },
  };
}

function makeRes() {
  let status = 200;
  let body = null;
  return {
    get status() { return status; },
    get body() { return body; },
    writeHead(s) { status = s; },
    end(raw) { body = raw ? JSON.parse(raw) : null; },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/v1/delegations - status filter validation", () => {
  it("returns 200 with no status param (unfiltered listing unchanged)", async () => {
    const res = makeRes();
    await listDelegationsHandler(makeReq("/api/v1/delegations"), res);
    assert.equal(res.status, 200);
    assert.equal(res.body.error, null);
    assert.ok(Array.isArray(res.body.data));
  });

  it("returns 200 for each valid status value", async () => {
    const validStatuses = ["pending", "active", "paused", "revoked", "expired"];
    for (const status of validStatuses) {
      const res = makeRes();
      await listDelegationsHandler(makeReq(`/api/v1/delegations?status=${status}`), res);
      assert.equal(res.status, 200, `Expected 200 for status=${status}`);
      assert.equal(res.body.error, null);
    }
  });

  it("returns 400 VALIDATION_ERROR for an unsupported status value", async () => {
    const res = makeRes();
    await listDelegationsHandler(makeReq("/api/v1/delegations?status=invalid"), res);
    assert.equal(res.status, 400);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });

  it("returns 400 VALIDATION_ERROR for another unknown status string", async () => {
    const res = makeRes();
    await listDelegationsHandler(makeReq("/api/v1/delegations?status=deleted"), res);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });
});
