/**
 * Unit tests for #340 — rate limit analytics aggregation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { aggregateRateLimitAnalytics, recordThrottle } from "./analytics.js";

// ─── Mock Redis client ────────────────────────────────────────────────────────

function buildMockRedis(keys: string[], values: Record<string, number>) {
  return {
    async scan(cursor: string, _match: string, _pattern: string, _count: string, _n: number) {
      // Return all keys in one shot then set cursor to "0" to stop
      if (cursor === "0") {
        return ["0", keys];
      }
      return ["0", []];
    },
    multi() {
      const cmds: string[] = [];
      const pipeline = {
        get(key: string) {
          cmds.push(key);
          return pipeline;
        },
        async exec() {
          return cmds.map((k) => {
            const v = values[k];
            return v !== undefined ? [null, String(v)] : [null, null];
          });
        },
        incr(_key: string) {
          return pipeline;
        },
      };
      return pipeline;
    },
    async expire() {
      return 1;
    },
  } as any;
}

describe("aggregateRateLimitAnalytics", () => {
  it("returns empty summary when there are no keys", async () => {
    const redis = buildMockRedis([], {});
    const result = await aggregateRateLimitAnalytics(10, redis);
    expect(result.endpoints).toEqual([]);
    expect(result.topUsers).toEqual([]);
    expect(result.generatedAt).toBeGreaterThan(0);
  });

  it("aggregates request counts across users for the same endpoint", async () => {
    const keys = [
      "ratelimit:user-1:POST:/api/v1/auth/login:100",
      "ratelimit:user-2:POST:/api/v1/auth/login:100",
      "ratelimit:user-1:GET:/api/v1/status:100",
    ];
    const values = {
      "ratelimit:user-1:POST:/api/v1/auth/login:100": 3,
      "ratelimit:user-2:POST:/api/v1/auth/login:100": 7,
      "ratelimit:user-1:GET:/api/v1/status:100": 5,
    };
    const redis = buildMockRedis(keys, values);
    const result = await aggregateRateLimitAnalytics(10, redis);

    const login = result.endpoints.find(
      (e) => e.endpoint === "POST:/api/v1/auth/login",
    );
    expect(login?.requestCount).toBe(10);
    expect(login?.throttleCount).toBe(0);

    const status = result.endpoints.find(
      (e) => e.endpoint === "GET:/api/v1/status",
    );
    expect(status?.requestCount).toBe(5);
  });

  it("includes throttle counts from throttle keys", async () => {
    const keys = [
      "ratelimit:user-1:POST:/api/v1/auth/login:100",
      "ratelimit:throttle:POST:/api/v1/auth/login:100",
    ];
    const values = {
      "ratelimit:user-1:POST:/api/v1/auth/login:100": 5,
      "ratelimit:throttle:POST:/api/v1/auth/login:100": 2,
    };
    const redis = buildMockRedis(keys, values);
    const result = await aggregateRateLimitAnalytics(10, redis);

    const login = result.endpoints.find(
      (e) => e.endpoint === "POST:/api/v1/auth/login",
    );
    expect(login?.requestCount).toBe(5);
    expect(login?.throttleCount).toBe(2);
  });

  it("returns topN users sorted by requestCount descending", async () => {
    const keys = [
      "ratelimit:power-user:GET:*:100",
      "ratelimit:casual-user:GET:*:100",
    ];
    const values = {
      "ratelimit:power-user:GET:*:100": 80,
      "ratelimit:casual-user:GET:*:100": 5,
    };
    const redis = buildMockRedis(keys, values);
    const result = await aggregateRateLimitAnalytics(2, redis);

    expect(result.topUsers[0]?.identifier).toBe("power-user");
    expect(result.topUsers[0]?.requestCount).toBe(80);
    expect(result.topUsers[1]?.identifier).toBe("casual-user");
  });

  it("respects the topN limit", async () => {
    const keys = Array.from({ length: 20 }, (_, i) => `ratelimit:user-${i}:GET:*:100`);
    const values = Object.fromEntries(keys.map((k, i) => [k, i + 1]));
    const redis = buildMockRedis(keys, values);
    const result = await aggregateRateLimitAnalytics(5, redis);
    expect(result.topUsers.length).toBeLessThanOrEqual(5);
  });
});
