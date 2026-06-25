import type { RateLimitConfig } from "./types.js";

export const RATE_LIMIT_RULES: Record<string, RateLimitConfig> = {
  "POST:/api/v1/auth/login":    { maxRequests: 5,   windowMs: 60000  },
  "POST:/api/v1/auth/register": { maxRequests: 3,   windowMs: 300000 },
  "POST:/api/v1/delegations":   { maxRequests: 20,  windowMs: 60000  },
  "POST:/api/v1/orders":        { maxRequests: 30,  windowMs: 60000  },
  "GET:*":                      { maxRequests: 100, windowMs: 60000  },
  "*":                          { maxRequests: 60,  windowMs: 60000  },
};

export const DEFAULT_RATE_LIMIT: RateLimitConfig = { maxRequests: 60, windowMs: 60000 };

export function getRateLimitConfig(method: string, path: string): RateLimitConfig {
  const exactKey = `${method}:${path}`;
  if (RATE_LIMIT_RULES[exactKey]) {
    return RATE_LIMIT_RULES[exactKey];
  }

  const methodGlob = `${method}:*`;
  if (RATE_LIMIT_RULES[methodGlob]) {
    return RATE_LIMIT_RULES[methodGlob];
  }

  if (RATE_LIMIT_RULES["*"]) {
    return RATE_LIMIT_RULES["*"];
  }

  return DEFAULT_RATE_LIMIT;
}
