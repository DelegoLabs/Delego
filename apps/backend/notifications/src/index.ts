/**
 * @delego/notifications — Entry point
 */
import { createLogger } from "@delego/utils";
import { startHttpServer } from "@delego/utils";
import { initWebSocketServer } from "./websocket.js";
import startEscrowEventListener from "./escrowEvents.js";

const SERVICE_NAME = "notifications";
const DEFAULT_PORT = 3015;

const nodeEnv = process.env.NODE_ENV ?? "development";
const logLevel = process.env.LOG_LEVEL ?? "info";
const log = createLogger(SERVICE_NAME, logLevel);
const port = Number(process.env.NOTIFICATIONS_PORT ?? DEFAULT_PORT);

log.info("Starting service", { port, nodeEnv });

const server = startHttpServer({
  port,
  serviceName: SERVICE_NAME,
  routes: [],
});

initWebSocketServer(server);

// Start Soroban escrow event listener if configured
const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const ESCROW_CONTRACT_ID = process.env.ESCROW_CONTRACT_ID ?? process.env.ESCROW_CONTRACT ?? null;
if (ESCROW_CONTRACT_ID) {
  startEscrowEventListener(SOROBAN_RPC_URL, ESCROW_CONTRACT_ID);
}

