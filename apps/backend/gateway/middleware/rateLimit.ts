import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@delego/utils";
import { checkRateLimit } from "../src/rateLimit/rateLimiter.js";
import { extractAuth } from "./auth.js";
import type { RateLimitConfig } from "../src/rateLimit/types.js";

function getIdentifier(req: IncomingMessage): string {
  const auth = extractAuth(req);
  if (auth.userId) {
    return auth.userId;
  }

  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }

  return req.socket.remoteAddress ?? "unknown";
}

function getEndpoint(req: IncomingMessage): string {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  return `${method}:${url.pathname}`;
}

export function rateLimitMiddleware(config?: RateLimitConfig) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: any) => void
  ): Promise<void> => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if ((req.method ?? "GET").toUpperCase() === "GET" && url.pathname === "/health") {
        next();
        return;
      }

      const identifier = getIdentifier(req);
      const endpoint = getEndpoint(req);

      const result = await checkRateLimit(identifier, endpoint, config);

      res.setHeader("RateLimit-Limit", result.limit);
      res.setHeader("RateLimit-Remaining", result.remaining);
      res.setHeader("RateLimit-Reset", result.resetInSeconds);

      if (!result.allowed) {
        res.setHeader("Retry-After", result.resetInSeconds);
        json(res, 429, {
          data: null,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: `Rate limit exceeded. Please retry after ${result.resetInSeconds} seconds.`,
          },
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
