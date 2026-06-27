/**
 * @delego/gateway — API entry point
 * Routes external requests to internal services.
 */
import { createLogger, startHttpServer } from "@delego/utils";
import { registerRoutes } from "../../routes/index.js";
import { rateLimitMiddleware } from "../../middleware/rateLimit.js";
const SERVICE_NAME = "gateway";
const DEFAULT_PORT = 3000;

const nodeEnv = process.env.NODE_ENV ?? "development";
const logLevel = process.env.LOG_LEVEL ?? "info";
const log = createLogger(SERVICE_NAME, logLevel);
const port = Number(process.env.GATEWAY_PORT ?? DEFAULT_PORT);

log.info("Starting gateway", { port, nodeEnv });

startHttpServer({
  port,
  serviceName: SERVICE_NAME,
  middleware: [rateLimitMiddleware()],
  routes: registerRoutes(),
});

export { checkRateLimit } from './rateLimiter.js';
export { getRedisClient, disconnectRedis } from './redisClient.js';
export { getRateLimitConfig } from './config.js';
