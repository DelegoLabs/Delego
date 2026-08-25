import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@delego/utils";
import { readJsonBody, InvalidJsonError, BodyTooLargeError } from "../src/request.js";
import { callDownstreamService } from "../src/serviceClient.js";

/**
 * Proxies to the wallet service's read-only preview_spend simulation.
 * Never calls any spend-mutating endpoint (e.g. /transactions/submit) —
 * this file only ever forwards to /permissions/spend-preview.
 */
export async function postSpendPreviewHandler(
  req: IncomingMessage,
  res: ServerResponse
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

  const result = await callDownstreamService("wallet", {
    method: "POST",
    path: "/permissions/spend-preview",
    body,
  });

  if (result.degraded) {
    json(res, 503, {
      data: null,
      error: { code: "SERVICE_UNAVAILABLE", message: result.data.message },
    });
    return;
  }

  json(res, 200, result.data);
}
