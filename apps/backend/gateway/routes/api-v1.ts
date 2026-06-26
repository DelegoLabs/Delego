import type { RouteHandler } from "@delego/utils";
import { json } from "@delego/utils";
import { internalError } from "../src/errors.js";

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
