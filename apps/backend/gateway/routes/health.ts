import type { RouteHandler } from "@delego/utils";
import { json } from "@delego/utils";
 #117--Gateway]-Add-Redis-Health-Check-to-Rate-Limiter-FIX
 #117--Gateway]-Add-Redis-Health-Check-to-Rate-Limiter-FIX
import { getRedisHealth } from "../src/rateLimit/redisClient.js";

export const healthHandler: RouteHandler = async (_req, res) => {
  const redis = await getRedisHealth();


import { checkDatabaseHealth } from "../src/db.js";
 main
import { internalError } from "../src/errors.js";

export interface DependencyHealth {
  name: string;
  status: "ok" | "degraded";
  latencyMs: number;
}

export const healthHandler: RouteHandler = async (req, res) => {
  if (process.env.GATEWAY_HEALTH_UNAVAILABLE === "true") {
    internalError(res, "Gateway health check unavailable", req);
    return;
  } main

  const dependencies: DependencyHealth[] = [];
  let overallStatus: "ok" | "degraded" = "ok";

  // Check PostgreSQL connectivity
  try {
    const latencyMs = await checkDatabaseHealth(5000);
    dependencies.push({
      name: "postgresql",
      status: "ok",
      latencyMs: Math.round(latencyMs),
    });
  } catch (err) {
    overallStatus = "degraded";
    dependencies.push({
      name: "postgresql",
      status: "degraded",
      latencyMs: 0,
    });
  }

  json(res, 200, {
    data: {
 #117--Gateway]-Add-Redis-Health-Check-to-Rate-Limiter-FIX
      status: redis.status === "ok" ? "ok" : "degraded",
      service: "gateway",
      version: "0.0.1",
      timestamp: new Date().toISOString(),
      rateLimiter: {
        redis,
      },

      status: overallStatus,
      service: "gateway",
      version: "0.0.1",
      timestamp: new Date().toISOString(),
      dependencies,
 main
    },
    error: null,
  });
};
