import type { RouteHandler } from "@delego/utils";
import { json } from "@delego/utils";
import { getRedisHealth } from "../src/rateLimit/redisClient.js";

export const healthHandler: RouteHandler = async (_req, res) => {
  const redis = await getRedisHealth();

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
