export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  redisClient?: any;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetInSeconds: number;
  identifier: string;
}
