/**
 * @delego/notifications — Entry point
 */
import { createLogger, startHttpServer, route, json } from "@delego/utils";
import { initWebSocketServer } from "./websocket.js";
import {
  savePushSubscription,
  removePushSubscription,
  dispatchTransactionApproval,
} from "./dispatcher.js";
import { getVapidPublicKey } from "../push/index.js";
import { startPermissionEventListener } from "./permissionEventListener.js";
import type { IncomingMessage, ServerResponse, Server } from "node:http";

const SERVICE_NAME = "notifications";
const DEFAULT_PORT = 3015;

const nodeEnv = process.env.NODE_ENV ?? "development";
const logLevel = process.env.LOG_LEVEL ?? "info";
const log = createLogger(SERVICE_NAME, logLevel);
const port = Number(process.env.NOTIFICATIONS_PORT ?? DEFAULT_PORT);

log.info("Starting service", { port, nodeEnv });

// Issue #57 — opt-in permission event listener.
// Requires both STELLAR_RPC_URL (or SOROBAN_RPC_URL) and
// PERMISSIONS_CONTRACT_ID to be set.  When unset the service boots normally
// without the listener so test environments and local dev do not need a live
// RPC.
const rpcUrl =
  process.env.STELLAR_RPC_URL ??
  process.env.SOROBAN_RPC_URL ??
  "";
const permissionsContractId =
  process.env.PERMISSIONS_CONTRACT_ID ?? "";

let permissionListener: { stop(): Promise<void> } | null = null;
if (rpcUrl && permissionsContractId) {
  try {
    permissionListener = startPermissionEventListener(
      rpcUrl,
      permissionsContractId
    );
    log.info("Permission event listener wired to boot", {
      rpcUrl,
      contractId: permissionsContractId,
    });
  } catch (err) {
    log.error("Failed to start permission event listener", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
} else {
  log.info(
    "Permission event listener disabled (set STELLAR_RPC_URL and PERMISSIONS_CONTRACT_ID to enable)"
  );
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

const server: Server = startHttpServer({
  port,
  serviceName: SERVICE_NAME,
  routes: [
    route("GET", "/vapid-public-key", (_req: IncomingMessage, res: ServerResponse) => {
      const key = getVapidPublicKey();
      if (!key) {
        json(res, 503, {
          data: null,
          error: { code: "NOT_CONFIGURED", message: "VAPID keys not set" },
        });
        return;
      }
      json(res, 200, { data: { publicKey: key }, error: null });
    }),

    route(
      "POST",
      "/subscriptions/:userId",
      async (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
        const body = (await readBody(req)) as { subscription: unknown };
        if (!body?.subscription) {
          json(res, 400, {
            data: null,
            error: { code: "BAD_REQUEST", message: "subscription is required" },
          });
          return;
        }
        await savePushSubscription(
          params.userId,
          body.subscription as Parameters<typeof savePushSubscription>[1]
        );
        json(res, 201, { data: { ok: true }, error: null });
      }
    ),

    route(
      "DELETE",
      "/subscriptions/:userId",
      async (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
        const body = (await readBody(req)) as { endpoint: unknown };
        if (!body?.endpoint || typeof body.endpoint !== "string") {
          json(res, 400, {
            data: null,
            error: { code: "BAD_REQUEST", message: "endpoint is required" },
          });
          return;
        }
        await removePushSubscription(params.userId, body.endpoint);
        json(res, 200, { data: { ok: true }, error: null });
      }
    ),

    route(
      "POST",
      "/notify/transaction-approval",
      async (req: IncomingMessage, res: ServerResponse) => {
        const body = (await readBody(req)) as Record<string, unknown>;
        const { userId, email, transactionId, amount, merchant, approvalUrl } =
          body;

        if (!userId || !transactionId || !amount || !merchant || !approvalUrl) {
          json(res, 400, {
            data: null,
            error: {
              code: "BAD_REQUEST",
              message:
                "userId, transactionId, amount, merchant, and approvalUrl are required",
            },
          });
          return;
        }

        await dispatchTransactionApproval({
          userId: String(userId),
          email: email ? String(email) : undefined,
          transactionId: String(transactionId),
          amount: String(amount),
          merchant: String(merchant),
          approvalUrl: String(approvalUrl),
        });

        json(res, 202, { data: { dispatched: true }, error: null });
      }
    ),
  ],
});

initWebSocketServer(server);

// Issue #57 — register graceful shutdown so the listener drains cleanly.
async function gracefulShutdown(signal: NodeJS.Signals): Promise<void> {
  log.info("Received shutdown signal", { signal });
  if (permissionListener) {
    try {
      await permissionListener.stop();
    } catch (err) {
      log.error("Failed to stop permission event listener cleanly", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  server.close(() => {
    log.info("HTTP server closed");
    process.exit(0);
  });
  // Hard deadline so a stuck close() does not hang forever.
  setTimeout(() => {
    log.warn("Force-exiting after shutdown timeout");
    process.exit(0);
  }, 10_000).unref();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void gracefulShutdown(signal);
  });
}
