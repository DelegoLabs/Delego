import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAllCircuitBreakers } from "../src/circuitBreaker.js";
import { postSpendPreviewHandler } from "./permissions.js";

function makeReq(body: unknown): IncomingMessage {
  const stream = new PassThrough() as unknown as IncomingMessage;
  (stream as unknown as { url: string }).url = "/";
  (stream as unknown as { headers: Record<string, string> }).headers = {};
  queueMicrotask(() => {
    (stream as unknown as PassThrough).write(JSON.stringify(body));
    (stream as unknown as PassThrough).end();
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

describe("postSpendPreviewHandler", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetAllCircuitBreakers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("forwards the body to the wallet service and returns the decoded preview", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { allowed: false, reason: "per_tx_limit", remainingAfterStroops: "50000000" },
        error: null,
      }),
    }) as unknown as typeof fetch;

    const req = makeReq({ owner: "GOWNER", delegate: "GDELEGATE", amountStroops: "300000000", merchant: "GMERCHANT" });
    const res = makeRes();

    await postSpendPreviewHandler(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/permissions/spend-preview"),
      expect.objectContaining({ method: "POST" })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      data: { allowed: false, reason: "per_tx_limit", remainingAfterStroops: "50000000" },
      error: null,
    });
  });

  it("returns 503 when the wallet service is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connection refused")) as unknown as typeof fetch;

    const req = makeReq({ owner: "GOWNER", delegate: "GDELEGATE", amountStroops: "300000000", merchant: "GMERCHANT" });
    const res = makeRes();

    await postSpendPreviewHandler(req, res);

    expect(res.statusCode).toBe(503);
    expect((res.body as { error: { code: string } }).error.code).toBe("SERVICE_UNAVAILABLE");
  });
});
