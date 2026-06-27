/**
 * @delego/wallet — Entry point
 *
 * Resolves the Stellar network configuration at startup so misconfiguration
 * (empty/unknown passphrases, mismatched STELLAR_NETWORK/STELLAR_PASSPHRASE,
 * missing URLs for custom networks) fails fast before we open any sockets.
 */
import { createLogger } from "@delego/utils";
import { startHttpServer } from "@delego/utils";
import { SorobanTransactionSimulator } from "./sorobanSimulator.js";
import { resolveAndValidateStellarConfig } from "./stellarConfig.js";

const SERVICE_NAME = "wallet";
const DEFAULT_PORT = 3012;

const nodeEnv = process.env.NODE_ENV ?? "development";
const logLevel = process.env.LOG_LEVEL ?? "info";
const log = createLogger(SERVICE_NAME, logLevel);
const port = Number(process.env.WALLET_PORT ?? DEFAULT_PORT);

let stellar;
try {
  stellar = resolveAndValidateStellarConfig();
} catch (err: any) {
  // Surface to both the structured logger and stderr so container
  // orchestrators see it even when stdout isn't being tailed.
  log.error("Invalid Stellar network configuration; refusing to start", {
    error: err.message,
  });
  process.stderr.write(
    `[wallet:startup] ${err.message}\n` +
      `[wallet:startup] Set STELLAR_NETWORK to one of: testnet, mainnet, futurenet.\n` +
      `[wallet:startup] If using a custom STELLAR_PASSPHRASE, also set STELLAR_HORIZON_URL and SOROBAN_RPC_URL.\n`
  );
  process.exit(1);
}

// Log only the selected network name and RPC URL — never the passphrase itself.
log.info("Stellar network configured", {
  network: stellar.network,
  sorobanRpcUrl: stellar.sorobanRpcUrl,
});

export const sorobanSimulator = new SorobanTransactionSimulator(stellar.sorobanRpcUrl);

log.info("Starting service", { port, nodeEnv });

import { registerRoutes } from "./routes.js";

startHttpServer({
  port,
  serviceName: SERVICE_NAME,
  routes: registerRoutes(),
});
