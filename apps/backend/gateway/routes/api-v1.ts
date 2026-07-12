import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteHandler } from "@delego/utils";
import { json } from "@delego/utils";
import { internalError, payloadTooLarge } from "../src/errors.js";

/**
 * JSON body size limit for API v1 routes.
 *
 * Environment: GATEWAY_API_V1_JSON_BODY_LIMIT — human-readable size (e.g. "100kb", "1mb").
 * Default: 100kb.
 */
export interface BodyLimitConfig {
  jsonLimit: string;
  routePrefix: string;
}

export const DEFAULT_BODY_LIMIT_CONFIG: BodyLimitConfig = {
  jsonLimit: "100kb",
  routePrefix: "/api/v1",
};

const LIMIT_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
};

/** Read body-limit settings from the environment with safe defaults. */
export function getBodyLimitConfig(): BodyLimitConfig {
  return {
    jsonLimit:
      process.env.GATEWAY_API_V1_JSON_BODY_LIMIT?.trim() ||
      DEFAULT_BODY_LIMIT_CONFIG.jsonLimit,
    routePrefix: DEFAULT_BODY_LIMIT_CONFIG.routePrefix,
  };
}

/** Parse a human-readable JSON body limit string into bytes. */
export function parseJsonLimit(limit: string): number {
  const trimmed = limit.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/);
  if (!match) {
    return parseJsonLimit(DEFAULT_BODY_LIMIT_CONFIG.jsonLimit);
  }

  const value = Number.parseFloat(match[1]);
  const unit = match[2] ?? "b";
  const multiplier = LIMIT_UNITS[unit];
  if (!multiplier || !Number.isFinite(value) || value < 0) {
    return parseJsonLimit(DEFAULT_BODY_LIMIT_CONFIG.jsonLimit);
  }

  return Math.floor(value * multiplier);
}

function hasRequestBody(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH";
}

function getRequestPathname(req: IncomingMessage): string {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  return url.pathname;
}

/** Reject oversized JSON payloads for API v1 routes before handlers run. */
export function bodyLimitMiddleware(config: BodyLimitConfig = getBodyLimitConfig()) {
  const maxBytes = parseJsonLimit(config.jsonLimit);

  return (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void): void => {
    const pathname = getRequestPathname(req);
    if (!pathname.startsWith(config.routePrefix)) {
      next();
      return;
    }

    const method = (req.method ?? "GET").toUpperCase();
    if (!hasRequestBody(method)) {
      next();
      return;
    }

    const contentLengthHeader = req.headers["content-length"];
    if (contentLengthHeader !== undefined) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        payloadTooLarge(
          res,
          `JSON body exceeds limit of ${config.jsonLimit}`,
          req,
          { limit: config.jsonLimit, maxBytes }
        );
        return;
      }
    }

    let received = 0;
    let rejected = false;

    const onData = (chunk: Buffer) => {
      received += chunk.length;
      if (rejected || received <= maxBytes) {
        return;
      }

      rejected = true;
      req.removeListener("data", onData);
      req.destroy();
      if (!res.headersSent) {
        payloadTooLarge(
          res,
          `JSON body exceeds limit of ${config.jsonLimit}`,
          req,
          { limit: config.jsonLimit, maxBytes }
        );
      }
    };

    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", cleanup);
      req.removeListener("error", cleanup);
    };

    req.on("data", onData);
    req.on("end", cleanup);
    req.on("error", cleanup);

    next();
  };
}

/** Placeholder API v1 status endpoint */
export const apiV1Handler: RouteHandler = (req, res) => {
  if (process.env.GATEWAY_MAINTENANCE_MODE === "true") {
    internalError(res, "Gateway is in maintenance mode", req);
    return;
  }

  json(res, 200, {
    data: {
      api: "v1",
      message: "Delego API — endpoints coming soon",
    },
    error: null,
  });
};
