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
import type { IncomingMessage, ServerResponse } from "node:http";

const SERVICE_NAME = "notifications";
const DEFAULT_PORT = 3015;

const nodeEnv = process.env.NODE_ENV ?? "development";
const logLevel = process.env.LOG_LEVEL ?? "info";
const log = createLogger(SERVICE_NAME, logLevel);
const port = Number(process.env.NOTIFICATIONS_PORT ?? DEFAULT_PORT);

log.info("Starting service", { port, nodeEnv });

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

const server = startHttpServer({
  port,
  serviceName: SERVICE_NAME,
  routes: [
    route("GET", "/vapid-public-key", (_req, res) => {
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
      async (req: IncomingMessage, res: ServerResponse, params) => {
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
      async (req: IncomingMessage, res: ServerResponse, params) => {
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
