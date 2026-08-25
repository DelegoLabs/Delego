import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAllCircuitBreakers } from "../src/circuitBreaker.js";
import { getRefundEligibilityHandler, postRefundRequestHandler } from "./escrow.js";

function makeReq(options: {
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
}): IncomingMessage {
  const stream = new PassThrough() as unknown as IncomingMessage;
  (stream as unknown as { url: string }).url = options.url ?? "/";
  (stream as unknown as { headers: Record<string, string> }).headers = options.headers ?? {};
  queueMicrotask(() => {
    const writable = stream as unknown as PassThrough;
    if (options.body !== undefined) {
      writable.write(JSON.stringify(options.body));
    }
    writable.end();
  });
  return stream;
}

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    writeHead(code: number) {
      res.statusCode = code;
    },
    end(data?: string) {
      res.body = data ? JSON.parse(data) : undefined;
    },
  };
  return res as unknown as ServerResponse & typeof res;
}

describe("escrow gateway proxy routes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetAllCircuitBreakers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("getRefundEligibilityHandler", () => {
    it("forwards the caller query param and returns the payments response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { escrowId: "42", eligible: false, reason: "timeout" },
          error: null,
        }),
      }) as unknown as typeof fetch;

      const req = makeReq({ url: "/?caller=GABC" });
      const res = makeRes();

      await getRefundEligibilityHandler(req, res, { escrowId: "42" });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/escrow/42/refund-eligibility?caller=GABC"),
        expect.anything()
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        data: { escrowId: "42", eligible: false, reason: "timeout" },
        error: null,
      });
    });

    it("returns 503 when the payments service is unreachable", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("connection refused")) as unknown as typeof fetch;

      const req = makeReq({ url: "/?caller=GABC" });
      const res = makeRes();

      await getRefundEligibilityHandler(req, res, { escrowId: "42" });

      expect(res.statusCode).toBe(503);
      expect((res.body as { error: { code: string } }).error.code).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("postRefundRequestHandler", () => {
    it("forwards the idempotency key header and body to the payments service", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { txHash: "abc", ledger: 1, success: true, refundReasonCode: "timeout" },
          error: null,
        }),
      }) as unknown as typeof fetch;

      const req = makeReq({
        headers: { "idempotency-key": "test-key-12345" },
        body: { sourceAddress: "GABC", refundReasonCode: "timeout" },
      });
      const res = makeRes();

      await postRefundRequestHandler(req, res, { escrowId: "42" });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/escrow/42/refund"),
        expect.objectContaining({
          headers: expect.objectContaining({ "Idempotency-Key": "test-key-12345" }),
        })
      );
      expect(res.statusCode).toBe(200);
    });

    it("rejects an invalid JSON body with 400", async () => {
      const stream = new PassThrough() as unknown as IncomingMessage;
      (stream as unknown as { url: string }).url = "/";
      (stream as unknown as { headers: Record<string, string> }).headers = {};
      queueMicrotask(() => {
        (stream as unknown as PassThrough).write("{not-json");
        (stream as unknown as PassThrough).end();
      });
      const res = makeRes();

      await postRefundRequestHandler(stream, res, { escrowId: "42" });

      expect(res.statusCode).toBe(400);
      expect((res.body as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
    });
  });
});
