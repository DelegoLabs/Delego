/**
 * #340 — Admin routes for the rate-limit dashboard.
 *
 * All routes require the caller to carry a valid JWT that includes the
 * "admin" role.  Unauthenticated or insufficiently-privileged requests
 * receive 401 / 403 respectively.
 *
 * Routes
 * ------
 *   GET /api/v1/admin/rate-limit/metrics
 *     Returns aggregated rate-limit analytics (request counts, throttle counts,
 *     top users).  Optional query param `topN` (integer, 1–100, default 10).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@delego/utils";
import { extractAuth, getAuthenticatedUserContext } from "../middleware/auth.js";
import { sendApiError, forbidden, unauthorized } from "../src/errors.js";
import { aggregateRateLimitAnalytics } from "../src/rateLimit/analytics.js";

/** Returns true when the authenticated user has the "admin" role. */
function isAdmin(req: IncomingMessage): boolean {
  const ctx = getAuthenticatedUserContext(req);
  return ctx?.roles?.includes("admin") ?? false;
}

/**
 * GET /api/v1/admin/rate-limit/metrics
 *
 * Query params:
 *   topN  — number of top users to include (1–100, default 10)
 */
export async function rateLimitMetricsHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Authentication check
  const auth = extractAuth(req);
  if (!auth.userId) {
    unauthorized(res, "Authentication required", req);
    return;
  }

  // Authorization check
  if (!isAdmin(req)) {
    forbidden(res, "Admin role required", req);
    return;
  }

  // Parse optional topN query param
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const topNParam = url.searchParams.get("topN");
  let topN = 10;
  if (topNParam !== null) {
    const parsed = parseInt(topNParam, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
      sendApiError(res, 400, "VALIDATION_ERROR", "topN must be an integer between 1 and 100", req);
      return;
    }
    topN = parsed;
  }

  try {
    const summary = await aggregateRateLimitAnalytics(topN);
    json(res, 200, { data: summary, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch rate limit analytics";
    sendApiError(res, 500, "INTERNAL_ERROR", message, req);
  }
}
