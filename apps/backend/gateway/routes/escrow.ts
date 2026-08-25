import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@delego/utils";
import { readJsonBody, InvalidJsonError, BodyTooLargeError } from "../src/request.js";
import { callDownstreamService } from "../src/serviceClient.js";

function sendDegraded(res: ServerResponse, message: string): void {
  json(res, 503, {
    data: null,
    error: { code: "SERVICE_UNAVAILABLE", message },
  });
}

export async function getRefundEligibilityHandler(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const caller = url.searchParams.get("caller") ?? "";

  const result = await callDownstreamService("payments", {
    method: "GET",
    path: `/escrow/${encodeURIComponent(params.escrowId)}/refund-eligibility?caller=${encodeURIComponent(caller)}`,
  });

  if (result.degraded) {
    sendDegraded(res, result.data.message);
    return;
  }

  json(res, 200, result.data);
}

export async function postRefundRequestHandler(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
): Promise<void> {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    if (err instanceof InvalidJsonError) {
      json(res, 400, {
        data: null,
        error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" },
      });
      return;
    }
    if (err instanceof BodyTooLargeError) {
      json(res, 413, {
        data: null,
        error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" },
      });
      return;
    }
    throw err;
  }

  const idempotencyKey = req.headers["idempotency-key"];

  const result = await callDownstreamService("payments", {
    method: "POST",
    path: `/escrow/${encodeURIComponent(params.escrowId)}/refund`,
    body,
    headers: typeof idempotencyKey === "string" ? { "Idempotency-Key": idempotencyKey } : undefined,
  });

  if (result.degraded) {
    sendDegraded(res, result.data.message);
    return;
  }

  json(res, 200, result.data);
}
