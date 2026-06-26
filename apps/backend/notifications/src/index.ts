/**
 * @delego/notifications — Entry point
 */
import { createLogger } from "@delego/utils";
import { startHttpServer } from "@delego/utils";
import { initWebSocketServer } from "./websocket.js";
import { startEscrowEventListener } from "./escrow-event-listener.js";

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

// Start the on-chain escrow event listener.
// Requires SOROBAN_RPC_URL and ESCROW_CONTRACT_ID to be set; logs a warning
// and skips gracefully when either is missing.
startEscrowEventListener(
  process.env.SOROBAN_RPC_URL ?? "",
  process.env.ESCROW_CONTRACT_ID ?? ""
);

