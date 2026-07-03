import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  bodyLimitMiddleware,
  getBodyLimitConfig,
  parseJsonLimit,
  DEFAULT_BODY_LIMIT_CONFIG,
} from "./api-v1.js";

type MockResponse = ServerResponse & {
  statusCode: number;
  body: string;
  headersSent: boolean;
};

function createMockReq(options: {
  method?: string;
  url?: string;
  contentLength?: string;
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage & { destroy: () => void };
  req.method = options.method ?? "POST";
  req.url = options.url ?? "/api/v1/auth/login";
  req.headers = {};
  req.destroy = vi.fn();
  if (options.contentLength !== undefined) {
    req.headers["content-length"] = options.contentLength;
  }
  return req;
}

function createMockRes(): MockResponse {
  const res = {
    statusCode: 0,
    body: "",
    headersSent: false,
    headers: {} as Record<string, string | string[] | number>,
    setHeader(name: string, value: string | number) {
      this.headers[name] = value;
    },
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      this.headersSent = true;
      if (headers) Object.assign(this.headers, headers);
    },
    end(body?: string) {
      if (body !== undefined) this.body = body;
    },
  };

  return res as MockResponse;
}

describe("parseJsonLimit", () => {
  it("parses kilobyte limits", () => {
    expect(parseJsonLimit("100kb")).toBe(102_400);
  });

  it("falls back to the default for invalid values", () => {
    expect(parseJsonLimit("not-a-size")).toBe(parseJsonLimit(DEFAULT_BODY_LIMIT_CONFIG.jsonLimit));
  });
});

describe("getBodyLimitConfig", () => {
  const originalLimit = process.env.GATEWAY_API_V1_JSON_BODY_LIMIT;

  afterEach(() => {
    if (originalLimit === undefined) {
      delete process.env.GATEWAY_API_V1_JSON_BODY_LIMIT;
    } else {
      process.env.GATEWAY_API_V1_JSON_BODY_LIMIT = originalLimit;
    }
  });

  it("returns defaults when the environment variable is unset", () => {
    delete process.env.GATEWAY_API_V1_JSON_BODY_LIMIT;
    expect(getBodyLimitConfig()).toEqual(DEFAULT_BODY_LIMIT_CONFIG);
  });

  it("reads a custom limit from the environment", () => {
    process.env.GATEWAY_API_V1_JSON_BODY_LIMIT = "256kb";
    expect(getBodyLimitConfig().jsonLimit).toBe("256kb");
  });
});

describe("bodyLimitMiddleware", () => {
  const config = { jsonLimit: "100b", routePrefix: "/api/v1" };

  it("allows under-limit payloads on API v1 routes", () => {
    const req = createMockReq({});
    const res = createMockRes();
    const next = vi.fn();

    bodyLimitMiddleware(config)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    req.emit("data", Buffer.alloc(50));
    req.emit("end");
    expect(res.statusCode).toBe(0);
  });

  it("rejects oversized payloads using Content-Length", () => {
    const req = createMockReq({ contentLength: "200" });
    const res = createMockRes();
    const next = vi.fn();

    bodyLimitMiddleware(config)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(413);

    const body = JSON.parse(res.body);
    expect(body.data).toBeNull();
    expect(body.error).toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      message: expect.stringContaining("100b"),
      details: { limit: "100b", maxBytes: 100 },
    });
    expect(body.meta.requestId).toEqual(expect.any(String));
    expect(body.meta.timestamp).toEqual(expect.any(String));
  });

  it("rejects oversized streamed payloads without Content-Length", () => {
    const req = createMockReq({});
    const res = createMockRes();
    const next = vi.fn();

    bodyLimitMiddleware(config)(req, res, next);
    expect(next).toHaveBeenCalledOnce();

    req.emit("data", Buffer.alloc(60));
    req.emit("data", Buffer.alloc(60));

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body).error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("skips non-API routes", () => {
    const req = createMockReq({ url: "/health", contentLength: "999999" });
    const res = createMockRes();
    const next = vi.fn();

    bodyLimitMiddleware(config)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it("skips GET requests on API v1 routes", () => {
    const req = createMockReq({ method: "GET", url: "/api/v1/delegations", contentLength: "999999" });
    const res = createMockRes();
    const next = vi.fn();

    bodyLimitMiddleware(config)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });
});
