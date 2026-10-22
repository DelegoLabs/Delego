import { describe, expect, it } from "vitest";
import {
  computeWebhookHealthScore,
  formatSuccessRate,
  getHealthTier,
  getRecentDeliveryErrors,
} from "./webhookHealth";
import type { WebhookDeliveryLog } from "./webhookDeliveryLog";

const ENDPOINT = "https://merchant.example.com/hooks";
const NOW = new Date("2026-03-10T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function log(overrides: Partial<WebhookDeliveryLog> = {}): WebhookDeliveryLog {
  return {
    eventId: "evt_1",
    endpointUrl: ENDPOINT,
    httpStatus: 200,
    deliveredAt: new Date(NOW.getTime() - HOUR),
    requestPayload: "{}",
    ...overrides,
  };
}

/** `ok` successes then `failed` failures, newest first, one hour apart. */
function deliveries(ok: number, failed: number, failedStatus = 504): WebhookDeliveryLog[] {
  const statuses = [...Array(failed).fill(failedStatus), ...Array(ok).fill(200)];
  return statuses.map((httpStatus, i) =>
    log({ eventId: `evt_${i}`, httpStatus, deliveredAt: new Date(NOW.getTime() - (i + 1) * HOUR) })
  );
}

describe("getHealthTier", () => {
  it.each([
    [100, "healthy"],
    [98, "healthy"],
    [97.99, "warning"],
    [97.5, "warning"],
    [97, "warning"],
    [90, "warning"],
    [89.99, "critical"],
    [89.5, "critical"],
    [0, "critical"],
  ] as const)("%s%% → %s", (rate, tier) => {
    expect(getHealthTier(rate)).toBe(tier);
  });
});

describe("computeWebhookHealthScore", () => {
  it("scores 98 of 100 successful deliveries as healthy", () => {
    const score = computeWebhookHealthScore(ENDPOINT, deliveries(98, 2), NOW);
    expect(score).toEqual({
      endpointId: ENDPOINT,
      successRatePercentage: 98,
      totalAttempts7d: 100,
      consecutiveFailures: 2,
      healthTier: "healthy",
    });
  });

  it("scores 97 of 100 as warning and 89 of 100 as critical", () => {
    expect(computeWebhookHealthScore(ENDPOINT, deliveries(97, 3), NOW).healthTier).toBe("warning");
    expect(computeWebhookHealthScore(ENDPOINT, deliveries(90, 10), NOW).healthTier).toBe("warning");
    expect(computeWebhookHealthScore(ENDPOINT, deliveries(89, 11), NOW).healthTier).toBe("critical");
  });

  it("counts any 2xx as a success", () => {
    const logs = [log({ httpStatus: 201 }), log({ httpStatus: 204 }), log({ httpStatus: 202 })];
    expect(computeWebhookHealthScore(ENDPOINT, logs, NOW).successRatePercentage).toBe(100);
  });

  it("ignores deliveries older than 7 days and other endpoints", () => {
    const logs = [
      log({ httpStatus: 200 }),
      log({ httpStatus: 500, deliveredAt: new Date(NOW.getTime() - 7 * 24 * HOUR) }),
      log({ httpStatus: 500, deliveredAt: new Date(NOW.getTime() - 8 * 24 * HOUR) }),
      log({ httpStatus: 500, endpointUrl: "https://other.example.com/hooks" }),
    ];
    const score = computeWebhookHealthScore(ENDPOINT, logs, NOW);
    expect(score.totalAttempts7d).toBe(1);
    expect(score.healthTier).toBe("healthy");
  });

  it("counts consecutive failures from the newest delivery back to the last success", () => {
    const logs = [
      log({ httpStatus: 504, deliveredAt: new Date(NOW.getTime() - 1 * HOUR) }),
      log({ httpStatus: 200, deliveredAt: new Date(NOW.getTime() - 3 * HOUR) }),
      log({ httpStatus: 502, deliveredAt: new Date(NOW.getTime() - 2 * HOUR) }),
      log({ httpStatus: 500, deliveredAt: new Date(NOW.getTime() - 4 * HOUR) }),
    ];
    expect(computeWebhookHealthScore(ENDPOINT, logs, NOW).consecutiveFailures).toBe(2);
  });

  it("reports no attempts as 100% healthy", () => {
    expect(computeWebhookHealthScore(ENDPOINT, [], NOW)).toMatchObject({
      successRatePercentage: 100,
      totalAttempts7d: 0,
      consecutiveFailures: 0,
      healthTier: "healthy",
    });
  });
});

describe("getRecentDeliveryErrors", () => {
  it("returns the newest failures with status labels, capped at the limit", () => {
    const logs = [
      log({ httpStatus: 500, deliveredAt: new Date(NOW.getTime() - 4 * HOUR) }),
      log({ httpStatus: 504, deliveredAt: new Date(NOW.getTime() - 1 * HOUR) }),
      log({ httpStatus: 200, deliveredAt: new Date(NOW.getTime() - 2 * HOUR) }),
      log({ httpStatus: 429, deliveredAt: new Date(NOW.getTime() - 3 * HOUR) }),
      log({ httpStatus: 502, deliveredAt: new Date(NOW.getTime() - 5 * HOUR) }),
    ];
    expect(getRecentDeliveryErrors(ENDPOINT, logs, NOW).map((e) => e.label)).toEqual([
      "504 Gateway Timeout",
      "429 Too Many Requests",
      "500 Internal Server Error",
    ]);
  });
});

describe("formatSuccessRate", () => {
  it("truncates to one decimal so amber scores never display as 98%", () => {
    expect(formatSuccessRate(97.96)).toBe(97.9);
    expect(formatSuccessRate(98)).toBe(98);
    expect(formatSuccessRate(100 / 3)).toBe(33.3);
  });
});
