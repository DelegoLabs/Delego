import type { Route } from "@delego/utils";
import { route } from "@delego/utils";
import { healthHandler } from "./health.js";
import { apiV1Handler } from "./api-v1.js";
import { registerHandler, loginHandler, refreshHandler } from "./auth.js";
import {
  createDelegationHandler,
  listDelegationsHandler,
  getDelegationHandler,
  updateDelegationHandler,
  revokeDelegationHandler,
} from "./delegations.js";

/** Register all gateway routes */
export function registerRoutes(): Route[] {
  return [
    route("GET", "/health", healthHandler),
    route("GET", "/api/v1/status", apiV1Handler),
    route("POST", "/api/v1/auth/register", registerHandler),
    route("POST", "/api/v1/auth/login", loginHandler),
    route("POST", "/api/v1/auth/refresh", refreshHandler),
    route("POST", "/api/v1/delegations", createDelegationHandler),
    route("GET", "/api/v1/delegations", listDelegationsHandler),
    route("GET", "/api/v1/delegations/:id", getDelegationHandler),
    route("PATCH", "/api/v1/delegations/:id", updateDelegationHandler),
    route("DELETE", "/api/v1/delegations/:id", revokeDelegationHandler),
  ];
}

