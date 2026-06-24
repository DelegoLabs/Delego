/**
 * @delego/notifications — Entry point
 */
import { createLogger } from "@delego/utils";
import { startHttpServer } from "@delego/utils";
import { initWebSocketServer } from "./websocket.js";
import { startPermissionEventListener } from "./permissionListener.js";

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

const rpcUrl = process.env.SOROBAN_RPC_URL;
const contractId = process.env.PERMISSIONS_CONTRACT_ID;

if (rpcUrl && contractId) {
  startPermissionEventListener(rpcUrl, contractId);
} else {
  log.warn("SOROBAN_RPC_URL or PERMISSIONS_CONTRACT_ID not set — permission event listener disabled");
}

