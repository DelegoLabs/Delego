import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildApiErrorBody,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  rateLimited,
  internalError,
} from "../../../apps/backend/gateway/dist/src/errors.js";
import { requestIdMiddleware, getRequestContext } from "../../../apps/backend/gateway/dist/middleware/requestId.js";

const mockReq = (headers = {}) => ({ headers });

const mockRes = () => {
  let statusCode = 0;
  let body = null;
  const headers = {};
  return {
    writeHead(status, _headers) {
      statusCode = status;
    },
    setHeader(name, value) {
      headers[name.toLowerCase()] = String(value);
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
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
};

describe("Gateway API error envelope helper", () => {
  it("builds the documented error envelope shape", () => {
    const body = buildApiErrorBody("NOT_FOUND", "Missing resource", {
      requestId: "req-123",
      details: { id: "abc" },
    });

    assert.equal(body.data, null);
    assert.equal(body.error.code, "NOT_FOUND");
    assert.equal(body.error.message, "Missing resource");
    assert.deepEqual(body.error.details, { id: "abc" });
    assert.equal(body.meta.requestId, "req-123");
    assert.match(body.meta.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes request id from middleware context in auth-style errors", async () => {
    const req = mockReq({ "x-request-id": "trace-auth-1" });
    const res = mockRes();

    await requestIdMiddleware()(req, res, () => {});
    unauthorized(res, "Invalid email or password", req);

    assert.equal(res.status, 401);
    assert.equal(res.parsedBody.error.code, "UNAUTHORIZED");
    assert.equal(res.parsedBody.meta.requestId, getRequestContext(req).requestId);
  });

  it("maps common HTTP status helpers to expected codes", () => {
    const cases = [
      [badRequest, 400, "VALIDATION_ERROR"],
      [unauthorized, 401, "UNAUTHORIZED"],
      [forbidden, 403, "FORBIDDEN"],
      [notFound, 404, "NOT_FOUND"],
      [rateLimited, 429, "RATE_LIMIT_EXCEEDED"],
      [internalError, 500, "INTERNAL_ERROR"],
    ];

    for (const [helper, status, code] of cases) {
      const res = mockRes();
      helper(res, "example failure");
      assert.equal(res.status, status);
      assert.equal(res.parsedBody.data, null);
      assert.equal(res.parsedBody.error.code, code);
      assert.equal(typeof res.parsedBody.meta.requestId, "string");
      assert.match(res.parsedBody.meta.timestamp, /^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("returns validation details for bad request failures", () => {
    const res = mockRes();
    const details = [{ field: "email", message: "required" }];
    badRequest(res, "Invalid request body", undefined, details);

    assert.equal(res.status, 400);
    assert.deepEqual(res.parsedBody.error.details, details);
  });
});
