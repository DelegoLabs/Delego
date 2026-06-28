import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@delego/utils";
import { generateId } from "@delego/utils";
import { getRequestContext } from "../middleware/requestId.js";

/** Issue #109 — Standard API error envelope with request metadata. */
export interface ApiErrorBody {
  data: null;
  error: { code: string; message: string; details?: unknown };
  meta: { requestId: string; timestamp: string };
}

export interface ApiErrorOptions {
  details?: unknown;
  requestId?: string;
}

function resolveRequestId(req?: IncomingMessage, override?: string): string {
  if (override) return override;
  if (req) {
    const ctx = getRequestContext(req);
    if (ctx?.requestId) return ctx.requestId;
  }
  return generateId();
}

export function buildApiErrorBody(
  code: string,
  message: string,
  options: ApiErrorOptions = {}
): ApiErrorBody {
  return {
    data: null,
    error: {
      code,
      message,
      ...(options.details !== undefined ? { details: options.details } : {}),
    },
    meta: {
      requestId: options.requestId ?? generateId(),
      timestamp: new Date().toISOString(),
    },
  };
}

export function sendApiError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  req?: IncomingMessage,
  options: Omit<ApiErrorOptions, "requestId"> = {}
): void {
  const body = buildApiErrorBody(code, message, {
    ...options,
    requestId: resolveRequestId(req),
  });
  json(res, status, body);
}

export function badRequest(
  res: ServerResponse,
  message: string,
  req?: IncomingMessage,
  details?: unknown
): void {
  sendApiError(res, 400, "VALIDATION_ERROR", message, req, { details });
}

export function unauthorized(
  res: ServerResponse,
  message: string,
  req?: IncomingMessage
): void {
  sendApiError(res, 401, "UNAUTHORIZED", message, req);
}

export function forbidden(
  res: ServerResponse,
  message: string,
  req?: IncomingMessage
): void {
  sendApiError(res, 403, "FORBIDDEN", message, req);
}

export function notFound(
  res: ServerResponse,
  message: string,
  req?: IncomingMessage
): void {
  sendApiError(res, 404, "NOT_FOUND", message, req);
}

export function rateLimited(
  res: ServerResponse,
  message: string,
  req?: IncomingMessage
): void {
  sendApiError(res, 429, "RATE_LIMIT_EXCEEDED", message, req);
}

export function payloadTooLarge(
  res: ServerResponse,
  message: string,
  req?: IncomingMessage,
  details?: unknown
): void {
  sendApiError(res, 413, "PAYLOAD_TOO_LARGE", message, req, { details });
}

export function internalError(
  res: ServerResponse,
  message: string,
  req?: IncomingMessage
): void {
  sendApiError(res, 500, "INTERNAL_ERROR", message, req);
}
