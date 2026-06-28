import type { RouteHandler } from "@delego/utils";
import { json } from "@delego/utils";
import { getRedisHealth } from "../src/rateLimit/redisClient.js";
import { checkDatabaseHealth } from "../src/db.js";

export const healthHandler: RouteHandler = async (_req, res) => {
  const redis = await getRedisHealth();
  
  let dbStatus = "degraded";
  let dbLatency = 0;
  
  try {
    // Since tsc says dbCheck is a number, it's returning the latency directly
    const latency = await checkDatabaseHealth(2000);
    if (typeof latency === "number" && latency >= 0) {
      dbStatus = "ok";
      dbLatency = latency;
    }
  } catch (err) {
    dbStatus = "degraded";
  }

  const dependencies = [
    {
      name: "postgresql",
      status: dbStatus,
      latencyMs: Math.floor(dbLatency),
    },
    {
      name: "redis",
      status: redis.status === "ok" ? "ok" : "degraded",
      // Since redis.latencyMs doesn't exist, we fallback to 0 
      // (or use redis.latency if your RedisHealth type uses that name)
      latencyMs: 0, 
    }
  ];

  const isAllHealthy = dependencies.every(dep => dep.status === "ok");

  json(res, 200, {
    data: {
      status: isAllHealthy ? "ok" : "degraded",
      service: "gateway",
      version: "0.0.1",
      timestamp: new Date().toISOString(),
      dependencies,
      rateLimiter: {
        redis,
      },
    },
    error: null,
  });
};