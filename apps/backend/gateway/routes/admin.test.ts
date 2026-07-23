/**
 * Unit tests for #340 — admin route protection.
 *
 * Verifies that:
 *   1. Unauthenticated requests → 401
 *   2. Authenticated non-admin requests → 403
 *   3. Admin requests → 200 with analytics payload
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { rateLimitMetricsHandler } from "./admin.js";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("../middleware/auth.js", () => ({
  extractAuth: vi.fn(),
  getAuthenticatedUserContext: vi.fn(),
}));

vi.mock("../src/rateLimit/analytics.js", () => ({
  aggregateRateLimitAnalytics: vi.fn().mockResolvedValue({
    endpoints: [],
    topUsers: [],
    generatedAt: 0,
  }),
}));

import { extractAuth, getAuthenticatedUserContext } from "../middleware/auth.js";
import { aggregateRateLimitAnalytics } from "../src/rateLimit/analytics.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(url = "/api/v1/admin/rate-limit/metrics"): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.headers = { host: "localhost" };
  req.url = url;
  req.method = "GET";
  return req;
}

function makeRes(): ServerResponse & { _body: string; _status: number } {
  const res: any = new EventEmitter();
  res._body = "";
  res._status = 0;
  res._headers = {} as Record<string, string>;
  res.statusCode = 200;
  res.setHeader = (k: string, v: string) => { res._headers[k] = v; };
  res.getHeader = (k: string) => res._headers[k];
  res.removeHeader = (_k: string) => {};
  res.writeHead = (status: number, headers?: Record<string, string>) => {
    res.statusCode = status;
    res._status = status;
    if (headers) Object.assign(res._headers, headers);
  };
  res.write = (chunk: string) => { res._body += chunk; return true; };
  res.end = (chunk?: string) => {
    if (chunk) res._body += chunk;
    res._status = res.statusCode;
  };
  return res;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("rateLimitMetricsHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the request is unauthenticated", async () => {
    vi.mocked(extractAuth).mockReturnValue({ userId: null, token: null });

    const req = makeReq();
    const res = makeRes();
    await rateLimitMetricsHandler(req, res as any);

    expect(res.statusCode).toBe(401);
  });

  it("returns 403 when user is authenticated but not an admin", async () => {
    vi.mocked(extractAuth).mockReturnValue({ userId: "user-1", token: "tok" });
    vi.mocked(getAuthenticatedUserContext).mockReturnValue({
      userId: "user-1",
      email: "user@example.com",
      roles: ["user"],
    });

    const req = makeReq();
    const res = makeRes();
    await rateLimitMetricsHandler(req, res as any);

    expect(res.statusCode).toBe(403);
  });

  it("returns 200 with analytics summary for admin users", async () => {
    vi.mocked(extractAuth).mockReturnValue({ userId: "admin-1", token: "tok" });
    vi.mocked(getAuthenticatedUserContext).mockReturnValue({
      userId: "admin-1",
      email: "admin@example.com",
      roles: ["admin"],
    });

    const req = makeReq();
    const res = makeRes();
    await rateLimitMetricsHandler(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(aggregateRateLimitAnalytics).toHaveBeenCalled();
  });

  it("passes topN query param to aggregateRateLimitAnalytics", async () => {
    vi.mocked(extractAuth).mockReturnValue({ userId: "admin-1", token: "tok" });
    vi.mocked(getAuthenticatedUserContext).mockReturnValue({
      userId: "admin-1",
      email: "admin@example.com",
      roles: ["admin"],
    });

    const req = makeReq("/api/v1/admin/rate-limit/metrics?topN=25");
    const res = makeRes();
    await rateLimitMetricsHandler(req, res as any);

    expect(aggregateRateLimitAnalytics).toHaveBeenCalledWith(25);
  });

  it("returns 400 for an invalid topN value", async () => {
    vi.mocked(extractAuth).mockReturnValue({ userId: "admin-1", token: "tok" });
    vi.mocked(getAuthenticatedUserContext).mockReturnValue({
      userId: "admin-1",
      email: "admin@example.com",
      roles: ["admin"],
    });

    const req = makeReq("/api/v1/admin/rate-limit/metrics?topN=abc");
    const res = makeRes();
    await rateLimitMetricsHandler(req, res as any);

    expect(res.statusCode).toBe(400);
  });
});
