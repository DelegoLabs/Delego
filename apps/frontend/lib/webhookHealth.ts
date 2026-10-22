/**
 * Webhook endpoint health score (#1010).
 *
 * Derives a 7-day delivery reliability score for one endpoint from the
 * client-side delivery log (`lib/webhookDeliveryLog.ts`, #725) — the gateway
 * has no delivery-stats endpoint yet, so the log is the only data source.
 */

import { isSuccessfulStatus, statusLabel, type WebhookDeliveryLog } from "./webhookDeliveryLog";

export interface WebhookHealthScore {
  endpointId: string;
  successRatePercentage: number;
  totalAttempts7d: number;
  consecutiveFailures: number;
  healthTier: "healthy" | "warning" | "critical";
}

export type WebhookHealthTier = WebhookHealthScore["healthTier"];

export interface WebhookDeliveryError {
  httpStatus: number;
  /** "504 Gateway Timeout" — reuses the delivery log viewer's labels. */
  label: string;
  deliveredAt: Date;
}

export const HEALTH_WINDOW_DAYS = 7;
/** At or above → "healthy" (green). */
export const HEALTHY_MIN_PERCENTAGE = 98;
/** At or above (and below HEALTHY_MIN_PERCENTAGE) → "warning" (amber); below → "critical" (red). */
export const WARNING_MIN_PERCENTAGE = 90;
/** How many recent failures the diagnostic tooltip lists. */
export const RECENT_ERROR_LIMIT = 3;

const WINDOW_MS = HEALTH_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Maps a 0–100 success rate to a tier: >= 98 healthy, 90–<98 warning, < 90 critical. */
export function getHealthTier(successRatePercentage: number): WebhookHealthTier {
  if (successRatePercentage >= HEALTHY_MIN_PERCENTAGE) return "healthy";
  if (successRatePercentage >= WARNING_MIN_PERCENTAGE) return "warning";
  return "critical";
}

/** This endpoint's deliveries from the last 7 days, newest first. */
function deliveriesInWindow(
  endpointId: string,
  logs: WebhookDeliveryLog[],
  now: Date
): WebhookDeliveryLog[] {
  const end = now.getTime();
  const start = end - WINDOW_MS;
  return logs
    .filter((log) => {
      const at = log.deliveredAt.getTime();
      return log.endpointUrl === endpointId && at > start && at <= end;
    })
    .sort((a, b) => b.deliveredAt.getTime() - a.deliveredAt.getTime());
}

/**
 * Scores `endpointId` (the endpoint URL — endpoints have no separate id) over
 * the last 7 days. Any 2xx counts as a successful delivery. With no attempts
 * in the window the endpoint is reported as 100% / healthy; callers should
 * check `totalAttempts7d` before presenting that as a measured score.
 */
export function computeWebhookHealthScore(
  endpointId: string,
  logs: WebhookDeliveryLog[],
  now: Date = new Date()
): WebhookHealthScore {
  const recent = deliveriesInWindow(endpointId, logs, now);
  const succeeded = recent.filter((log) => isSuccessfulStatus(log.httpStatus)).length;
  const successRatePercentage = recent.length === 0 ? 100 : (succeeded / recent.length) * 100;

  let consecutiveFailures = 0;
  for (const log of recent) {
    if (isSuccessfulStatus(log.httpStatus)) break;
    consecutiveFailures++;
  }

  return {
    endpointId,
    successRatePercentage,
    totalAttempts7d: recent.length,
    consecutiveFailures,
    healthTier: getHealthTier(successRatePercentage),
  };
}

/** The most recent failed deliveries in the 7-day window, newest first. */
export function getRecentDeliveryErrors(
  endpointId: string,
  logs: WebhookDeliveryLog[],
  now: Date = new Date(),
  limit: number = RECENT_ERROR_LIMIT
): WebhookDeliveryError[] {
  return deliveriesInWindow(endpointId, logs, now)
    .filter((log) => !isSuccessfulStatus(log.httpStatus))
    .slice(0, limit)
    .map((log) => ({
      httpStatus: log.httpStatus,
      label: statusLabel(log.httpStatus),
      deliveredAt: log.deliveredAt,
    }));
}

/**
 * Display value for the gauge, truncated (not rounded) to one decimal so a
 * 97.96% endpoint reads "97.9%" next to its amber badge rather than "98.0%".
 */
export function formatSuccessRate(successRatePercentage: number): number {
  return Math.floor(successRatePercentage * 10) / 10;
}
