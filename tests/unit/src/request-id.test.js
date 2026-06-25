import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requestIdMiddleware, getRequestContext } from "../../../apps/backend/gateway/dist/middleware/requestId.js";

const mockReq = (headers = {}) => ({ headers });

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

describe("Gateway Request Id Middleware", () => {
  it("generates a request id when none is forwarded", async () => {
    const req = mockReq();
    const res = mockRes();
    let nextCalled = false;

    await requestIdMiddleware()(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    const header = res.getHeader("X-Request-Id");
    assert.ok(header);
    assert.equal(getRequestContext(req).requestId, header);
  });

  it("forwards the inbound X-Request-Id header", async () => {
    const req = mockReq({ "x-request-id": "client-supplied-id" });
    const res = mockRes();

    await requestIdMiddleware()(req, res, () => {});

    assert.equal(res.getHeader("X-Request-Id"), "client-supplied-id");
    assert.equal(getRequestContext(req).requestId, "client-supplied-id");
  });

  it("generates a new id when the forwarded header is blank", async () => {
    const req = mockReq({ "x-request-id": "   " });
    const res = mockRes();

    await requestIdMiddleware()(req, res, () => {});

    const header = res.getHeader("X-Request-Id");
    assert.ok(header && header.trim().length > 0);
    assert.notEqual(header, "   ");
  });
});
