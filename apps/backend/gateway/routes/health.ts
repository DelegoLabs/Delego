import type { RouteHandler } from "@delego/utils";
import { json } from "@delego/utils";
import { internalError } from "../src/errors.js";

export const healthHandler: RouteHandler = (req, res) => {
  if (process.env.GATEWAY_HEALTH_UNAVAILABLE === "true") {
    internalError(res, "Gateway health check unavailable", req);
    return;
  }

  json(res, 200, {
    data: {
      status: "ok",
      service: "gateway",
      version: "0.0.1",
      timestamp: new Date().toISOString(),
    },
    error: null,
  });
};
