import type { RouteHandler } from "@delego/utils";
import { json } from "@delego/utils";
 #117--Gateway]-Add-Redis-Health-Check-to-Rate-Limiter-FIX
import { getRedisHealth } from "../src/rateLimit/redisClient.js";

export const healthHandler: RouteHandler = async (_req, res) => {
  const redis = await getRedisHealth();

import { internalError } from "../src/errors.js";

export const healthHandler: RouteHandler = (req, res) => {
  if (process.env.GATEWAY_HEALTH_UNAVAILABLE === "true") {
    internalError(res, "Gateway health check unavailable", req);
    return;
  } main

  json(res, 200, {
    data: {
      status: redis.status === "ok" ? "ok" : "degraded",
      service: "gateway",
      version: "0.0.1",
      timestamp: new Date().toISOString(),
      rateLimiter: {
        redis,
      },
    },
    error: null,
  });
};
