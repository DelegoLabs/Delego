import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { applyCors } from "../../../apps/backend/gateway/dist/middleware/cors.js";
import { requestIdMiddleware } from "../../../apps/backend/gateway/dist/middleware/requestId.js";

const mockReq = (origin, headers = {}) => ({
  headers: { origin, ...headers },
  url: "/api/v1/delegations",
});

const mockRes = () => {
  const headers = {};
  return {
    setHeader(name, value) {
      headers[name.toLowerCase()] = String(value);
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
  };
};

describe("Gateway CORS Origin Audit Logging", () => {
  let originalConsoleLog;
  let logs;

  before(() => {
    process.env.CORS_ORIGIN = "https://app.delego.dev,https://admin.delego.dev";
    originalConsoleLog = console.log;
  });

  after(() => {
    console.log = originalConsoleLog;
    delete process.env.CORS_ORIGIN;
  });

  beforeEach(() => {
    logs = [];
    console.log = (line) => logs.push(line);
  });

  it("allows a whitelisted origin and does not log anything", async () => {
    const req = mockReq("https://app.delego.dev");
    const res = mockRes();
    await requestIdMiddleware()(req, res, () => {});

    applyCors(req, res);

    assert.equal(res.getHeader("Access-Control-Allow-Origin"), "https://app.delego.dev");
    assert.equal(logs.length, 0);
  });

  it("rejects a non-whitelisted origin and logs requestId, origin, path, and rejectedAt", async () => {
    const req = mockReq("https://evil.example.com");
    const res = mockRes();
    await requestIdMiddleware()(req, res, () => {});

    applyCors(req, res);

    assert.equal(res.getHeader("Access-Control-Allow-Origin"), undefined);
    assert.equal(logs.length, 1);

    const entry = JSON.parse(logs[0]);
    assert.equal(entry.message, "CORS origin rejected");
    assert.equal(entry.origin, "https://evil.example.com");
    assert.equal(entry.path, "/api/v1/delegations");
    assert.equal(entry.requestId, res.getHeader("X-Request-Id"));
    assert.ok(entry.rejectedAt);
    assert.equal(entry.authorization, undefined);
    assert.equal(entry.cookie, undefined);
  });

  it("does not log when there is no Origin header (server-to-server request)", async () => {
    const req = mockReq(undefined);
    const res = mockRes();

    applyCors(req, res);

    assert.equal(logs.length, 0);
  });
});
