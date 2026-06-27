import type { RouteHandler } from "@delego/utils";
import { json } from "@delego/utils";
import { checkDatabaseHealth } from "../src/db.js";
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
  }

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
      status: overallStatus,
      service: "gateway",
      version: "0.0.1",
      timestamp: new Date().toISOString(),
      dependencies,
    },
    error: null,
  });
};
