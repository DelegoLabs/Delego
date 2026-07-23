/**
 * Unit tests for #345 — compression middleware.
 */

import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import {
  selectEncoding,
  compressionMiddleware,
  COMPRESSION_THRESHOLD_BYTES,
} from "./compression.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(acceptEncoding?: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.headers = acceptEncoding
    ? { "accept-encoding": acceptEncoding }
    : {};
  req.url = "/api/v1/test";
  req.method = "GET";
  return req;
}

function makeRes(onEnd: (body: Buffer, headers: Record<string, any>) => void) {
  const headers: Record<string, any> = {};
  const chunks: Buffer[] = [];

  const res: any = new EventEmitter();
  res.statusCode = 200;
  res.setHeader = (k: string, v: any) => { headers[k.toLowerCase()] = v; };
  res.getHeader = (k: string) => headers[k.toLowerCase()];
  res.removeHeader = (k: string) => { delete headers[k.toLowerCase()]; };
  res.write = (chunk: any) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  };
  res.end = (chunk?: any) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    onEnd(Buffer.concat(chunks), headers);
  };
  return res;
}

// ─── selectEncoding ───────────────────────────────────────────────────────────

describe("selectEncoding", () => {
  it("returns identity when no Accept-Encoding header is present", () => {
    expect(selectEncoding(makeReq())).toBe("identity");
  });

  it("prefers brotli over gzip", () => {
    expect(selectEncoding(makeReq("gzip, br"))).toBe("br");
  });

  it("returns gzip when only gzip is advertised", () => {
    expect(selectEncoding(makeReq("gzip"))).toBe("gzip");
  });

  it("returns identity for unsupported encodings", () => {
    expect(selectEncoding(makeReq("deflate"))).toBe("identity");
  });
});

// ─── compressionMiddleware ────────────────────────────────────────────────────

describe("compressionMiddleware", () => {
  it("does not compress small responses below the threshold", async () => {
    const middleware = compressionMiddleware();
    const req = makeReq("gzip");
    const smallBody = "x".repeat(COMPRESSION_THRESHOLD_BYTES - 1);

    await new Promise<void>((resolve) => {
      const res = makeRes((_body, headers) => {
        // No Content-Encoding header set → not compressed
        expect(headers["content-encoding"]).toBeUndefined();
        resolve();
      });
      middleware(req, res, () => {
        res.end(smallBody);
      });
    });
  });

  it("compresses large responses when client supports gzip", async () => {
    const middleware = compressionMiddleware();
    const req = makeReq("gzip");
    const largeBody = "x".repeat(COMPRESSION_THRESHOLD_BYTES + 1);

    await new Promise<void>((resolve) => {
      const res = makeRes((_body, headers) => {
        expect(headers["content-encoding"]).toBe("gzip");
        resolve();
      });
      middleware(req, res, () => {
        res.end(largeBody);
      });
    });
  });

  it("compresses large responses with brotli when preferred", async () => {
    const middleware = compressionMiddleware();
    const req = makeReq("br, gzip");
    const largeBody = "y".repeat(COMPRESSION_THRESHOLD_BYTES + 100);

    await new Promise<void>((resolve) => {
      const res = makeRes((_body, headers) => {
        expect(headers["content-encoding"]).toBe("br");
        resolve();
      });
      middleware(req, res, () => {
        res.end(largeBody);
      });
    });
  });

  it("passes through without compression when no Accept-Encoding is sent", async () => {
    const middleware = compressionMiddleware();
    const req = makeReq(); // no accept-encoding
    const largeBody = "z".repeat(COMPRESSION_THRESHOLD_BYTES + 1);

    await new Promise<void>((resolve) => {
      const res = makeRes((body, headers) => {
        expect(headers["content-encoding"]).toBeUndefined();
        expect(body.toString()).toBe(largeBody);
        resolve();
      });
      middleware(req, res, () => {
        res.end(largeBody);
      });
    });
  });

  it("calls next() to continue the middleware chain", async () => {
    const middleware = compressionMiddleware();
    const req = makeReq("gzip");
    // Provide a minimal but functional res so wrapResponse can bind write/end
    const res: any = new EventEmitter();
    res.statusCode = 200;
    res.setHeader = () => {};
    res.getHeader = () => undefined;
    res.removeHeader = () => {};
    res.write = () => true;
    res.end = () => {};

    await new Promise<void>((resolve) => {
      middleware(req, res, () => {
        resolve();
      });
    });
  });
});
