/**
 * Rate limit rules — per-endpoint overrides and config lookup.
 * @see AGENTS.md — Acceptance Criteria → RATE_LIMIT_RULES
 */

import type { RateLimitConfig } from "./types.js";

/** Per-endpoint overrides */
export const RATE_LIMIT_RULES: Record<string, RateLimitConfig> = {
  // Auth endpoints — strict to prevent brute force
  "POST:/api/v1/auth/login":    { maxRequests: 5,   windowSeconds: 60  },
  "POST:/api/v1/auth/register": { maxRequests: 3,   windowSeconds: 300 },

  // OAuth initiation — prevent redirect abuse
  "GET:/api/v1/auth/oauth/google":          { maxRequests: 10,  windowSeconds: 60  },
  "GET:/api/v1/auth/oauth/github":          { maxRequests: 10,  windowSeconds: 60  },
  // OAuth callbacks — strict; codes are single-use so repeated hits = attack
  "GET:/api/v1/auth/oauth/google/callback": { maxRequests: 10,  windowSeconds: 60  },
  "GET:/api/v1/auth/oauth/github/callback": { maxRequests: 10,  windowSeconds: 60  },

  // Transaction endpoints — moderate
  "POST:/api/v1/delegations":   { maxRequests: 20,  windowSeconds: 60  },
  "POST:/api/v1/orders":        { maxRequests: 30,  windowSeconds: 60  },

  // Read endpoints — generous
  "GET:*":                      { maxRequests: 100, windowSeconds: 60  },

  // Default fallback
  "*":                          { maxRequests: 60,  windowSeconds: 60  },
};

/** Default config used when no override is specified */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = { maxRequests: 60, windowSeconds: 60 };

/**
 * Look up the most specific matching rate limit rule.
 *
 * Priority:
 *  1. Exact match  — e.g. "POST:/api/v1/auth/login"
 *  2. Method glob  — e.g. "GET:*"
 *  3. Global glob  — "*"
 *  4. Fallback     — DEFAULT_RATE_LIMIT
 */
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
