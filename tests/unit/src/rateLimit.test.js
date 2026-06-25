import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getRateLimitConfig,
  checkRateLimit,
  getRedisClient,
  disconnectRedis,
} from "../../../apps/backend/gateway/dist/src/rateLimit/index.js";
import { rateLimitMiddleware } from "../../../apps/backend/gateway/dist/middleware/rateLimit.js";
import { generateToken } from "../../../apps/backend/gateway/dist/src/auth/authService.js";

describe("Gateway Rate Limiting System", () => {
  before(() => {
    process.env.NODE_ENV = "test";
    process.env.MOCK_REDIS = "true";
  });

  after(async () => {
    await disconnectRedis();
  });

  beforeEach(async () => {
    const redis = getRedisClient();
    await redis.flushall();
  });

  describe("getRateLimitConfig", () => {
    it("should match exact endpoint overrides first", () => {
      const config = getRateLimitConfig("POST", "/api/v1/auth/login");
      assert.equal(config.maxRequests, 5);
      assert.equal(config.windowMs, 60000);
    });

    it("should match method glob overrides next", () => {
      const config = getRateLimitConfig("GET", "/api/v1/delegations");
      assert.equal(config.maxRequests, 100);
      assert.equal(config.windowMs, 60000);
    });

    it("should fallback to global default for unmatched routes", () => {
      const config = getRateLimitConfig("POST", "/api/v1/unknown");
      assert.equal(config.maxRequests, 60);
      assert.equal(config.windowMs, 60000);
    });
  });

  describe("checkRateLimit Core Logic", () => {
    it("should allow requests under the limit", async () => {
      const result = await checkRateLimit("user-1", "POST:/api/v1/auth/login");
      assert.equal(result.allowed, true);
      assert.equal(result.limit, 5);
      assert.equal(result.remaining, 4);
      assert.equal(result.identifier, "user-1");
      assert.ok(result.resetInSeconds > 0 && result.resetInSeconds <= 60);
    });

    it("should block the (N+1)th request and return 429 status", async () => {
      for (let i = 0; i < 5; i++) {
        const res = await checkRateLimit("user-2", "POST:/api/v1/auth/login");
        assert.equal(res.allowed, true);
        assert.equal(res.remaining, 4 - i);
      }

      const blockRes = await checkRateLimit("user-2", "POST:/api/v1/auth/login");
      assert.equal(blockRes.allowed, false);
      assert.equal(blockRes.remaining, 0);
    });

    it("should reset rate limit after window expires", async () => {
      const endpoint = "POST:/api/v1/auth/login";
      const user = "user-reset-test";

      for (let i = 0; i < 5; i++) {
        await checkRateLimit(user, endpoint);
      }
      const blocked = await checkRateLimit(user, endpoint);
      assert.equal(blocked.allowed, false);

      const originalNow = Date.now;
      try {
        Date.now = () => originalNow() + 61 * 1000;

        const allowedAgain = await checkRateLimit(user, endpoint);
        assert.equal(allowedAgain.allowed, true);
        assert.equal(allowedAgain.remaining, 4);
      } finally {
        Date.now = originalNow;
      }
    });
  });

  describe("rateLimitMiddleware", () => {
    const mockReq = (method, path, headers = {}, ip = "127.0.0.1") => {
      return {
        method,
        url: `http://localhost${path}`,
        headers,
        socket: { remoteAddress: ip },
      };
    };

    const mockRes = () => {
      const headers = {};
      let statusCode = 200;
      let bodyStr = "";

      return {
        setHeader(name, value) {
          headers[name.toLowerCase()] = String(value);
        },
        getHeader(name) {
          return headers[name.toLowerCase()];
        },
        writeHead(status, customHeaders) {
          statusCode = status;
          if (customHeaders) {
            for (const [k, v] of Object.entries(customHeaders)) {
              headers[k.toLowerCase()] = String(v);
            }
          }
        },
        end(data) {
          bodyStr = data;
        },
        get headers() {
          return headers;
        },
        get statusCode() {
          return statusCode;
        },
        get body() {
          return bodyStr ? JSON.parse(bodyStr) : null;
        },
      };
    };

    it("should set RateLimit-* headers on allowed responses", async () => {
      const req = mockReq("GET", "/api/v1/status");
      const res = mockRes();
      let nextCalled = false;

      const middleware = rateLimitMiddleware();
      await middleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(res.getHeader("RateLimit-Limit"), "100");
      assert.ok(Number(res.getHeader("RateLimit-Remaining")) >= 99);
      assert.ok(res.getHeader("RateLimit-Reset") !== undefined);
    });

    it("should return 429 with RATE_LIMIT_EXCEEDED on rate limit violation", async () => {
      const req = mockReq("POST", "/api/v1/auth/register");
      const middleware = rateLimitMiddleware();

      for (let i = 0; i < 3; i++) {
        const res = mockRes();
        let nextCalled = false;
        await middleware(req, res, () => {
          nextCalled = true;
        });
        assert.equal(nextCalled, true);
      }

      const res429 = mockRes();
      let nextCalled429 = false;
      await middleware(req, res429, () => {
        nextCalled429 = true;
      });

      assert.equal(nextCalled429, false);
      assert.equal(res429.statusCode, 429);
      assert.equal(res429.getHeader("Retry-After") !== undefined, true);

      const body = res429.body;
      assert.equal(body.data, null);
      assert.equal(body.error.code, "RATE_LIMIT_EXCEEDED");
      assert.match(body.error.message, /Rate limit exceeded\. Please retry after/);
    });

    it("should key authenticated users by userId and not by IP", async () => {
      const tokenUser1 = generateToken("user-id-abc");
      const tokenUser2 = generateToken("user-id-xyz");

      const req1 = mockReq("POST", "/api/v1/auth/login", {
        authorization: `Bearer ${tokenUser1}`,
      });
      const req2 = mockReq("POST", "/api/v1/auth/login", {
        authorization: `Bearer ${tokenUser2}`,
      });

      const middleware = rateLimitMiddleware();

      for (let i = 0; i < 5; i++) {
        const res = mockRes();
        await middleware(req1, res, () => {});
      }

      const resBlocked = mockRes();
      await middleware(req1, resBlocked, () => {});
      assert.equal(resBlocked.statusCode, 429);

      const resAllowed = mockRes();
      let nextCalled = false;
      await middleware(req2, resAllowed, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
      assert.equal(Number(resAllowed.getHeader("RateLimit-Remaining")), 4);
    });
  });
});
