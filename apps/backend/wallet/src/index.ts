/**
 * @delego/wallet — Entry point
 * TODO: Implement service logic
 */
import { createLogger } from "@delego/utils";
import { startHttpServer } from "@delego/utils";
import { SorobanTransactionSimulator, readSorobanRpcConfig } from "./sorobanSimulator.js";

const SERVICE_NAME = "wallet";
const DEFAULT_PORT = 3012;

const nodeEnv = process.env.NODE_ENV ?? "development";
const logLevel = process.env.LOG_LEVEL ?? "info";
const log = createLogger(SERVICE_NAME, logLevel);
const port = Number(process.env.WALLET_PORT ?? DEFAULT_PORT);

const sorobanConfig = readSorobanRpcConfig();
log.info("Starting service", { port, nodeEnv, sorobanRpcTimeoutMs: sorobanConfig.timeoutMs, sorobanRpcMaxRetries: sorobanConfig.maxRetries });

export const sorobanSimulator = new SorobanTransactionSimulator(sorobanConfig);

import { registerRoutes } from "./routes.js";

startHttpServer({
  port,
  serviceName: SERVICE_NAME,
  routes: registerRoutes(),
});

// TODO: Wire routes, database, and domain logic
