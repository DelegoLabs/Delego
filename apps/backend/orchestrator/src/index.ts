/**
 * @delego/orchestrator — Workflow coordination
 */
import { createLogger, json, route, startHttpServer } from "@delego/utils";
import { restorePurchaseWorkflow } from "../workflows/purchase/index.js";
import {
  checkoutWorkflow,
  createCheckoutSagaCoordinator,
  type CheckoutWorkflowInput,
} from "../workflows/checkout/index.js";
import { connectSagaDb, PostgresSagaStore } from "./saga/index.js";

const SERVICE_NAME = "orchestrator";
const DEFAULT_PORT = 3010;
const MAX_REQUEST_BODY_BYTES = Number(process.env.MAX_REQUEST_BODY_BYTES ?? 1_048_576);

const logLevel = process.env.LOG_LEVEL ?? "info";
const log = createLogger(SERVICE_NAME, logLevel);
const port = Number(process.env.ORCHESTRATOR_PORT ?? DEFAULT_PORT);

const sagaStore = new PostgresSagaStore();
const checkoutSagaCoordinator = createCheckoutSagaCoordinator(sagaStore);

function readJsonBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_REQUEST_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("JSON body must be an object");
        }
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function main(): Promise<void> {
  // Connect and recover before accepting traffic so checkout requests never race startup
  // recovery — and fail fast (rather than just logging) if durable saga storage isn't ready.
  await connectSagaDb();
  await checkoutSagaCoordinator.recoverAll();

  log.info("Starting orchestrator", { port });

  startHttpServer({
    port,
    serviceName: SERVICE_NAME,
    routes: [
      route("POST", "/checkout", async (req, res) => {
        let body: Record<string, unknown>;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          json(res, 400, {
            data: null,
            error: {
              code: "VALIDATION_ERROR",
              message: err instanceof Error ? err.message : "Invalid JSON body",
            },
          });
          return;
        }

        const input = body as Partial<CheckoutWorkflowInput>;
        if (
          typeof input.orderId !== "string" ||
          typeof input.sourceAddress !== "string" ||
          typeof input.buyerAddress !== "string" ||
          typeof input.sellerAddress !== "string"
        ) {
          json(res, 400, {
            data: null,
            error: {
              code: "VALIDATION_ERROR",
              message: "orderId, sourceAddress, buyerAddress and sellerAddress are required",
            },
          });
          return;
        }

        try {
          // Derived from orderId (not generateId()) so retried checkout requests for the same
          // order reuse the same saga and SagaCoordinator.run()'s idempotency actually applies —
          // otherwise every retry would start a fresh saga and could double-deposit escrow.
          const sagaId = `checkout:${input.orderId}`;
          const result = await checkoutWorkflow(input as CheckoutWorkflowInput, checkoutSagaCoordinator, sagaId);
          json(res, result.status === "completed" ? 200 : 502, {
            data: {
              sagaId: result.sagaId,
              orderId: result.orderId,
              status: result.status,
              completedSteps: result.completedSteps,
            },
            error:
              result.status === "completed"
                ? null
                : { code: "CHECKOUT_SAGA_FAILED", message: result.error ?? "Checkout saga failed" },
          });
        } catch (err) {
          json(res, 502, {
            data: null,
            error: {
              code: "CHECKOUT_SAGA_FAILED",
              message: err instanceof Error ? err.message : "Checkout saga failed",
            },
          });
        }
      }),

      route("GET", "/sagas/:sagaId", async (_req, res, params) => {
        const record = await sagaStore.get(params.sagaId);
        if (!record) {
          json(res, 404, {
            data: null,
            error: { code: "NOT_FOUND", message: `Saga not found: ${params.sagaId}` },
          });
          return;
        }
        json(res, 200, {
          data: {
            sagaId: record.sagaId,
            orderId: record.orderId,
            status: record.status,
            completedSteps: record.completedSteps,
          },
          error: null,
        });
      }),

      route("POST", "/sagas/:sagaId/resume", async (_req, res, params) => {
        try {
          const result = await checkoutSagaCoordinator.resume(params.sagaId);
          json(res, 200, {
            data: {
              sagaId: result.sagaId,
              orderId: result.orderId,
              status: result.status,
              completedSteps: result.completedSteps,
            },
            error: null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to resume saga";
          const status = message.startsWith("Saga not found") ? 404 : 502;
          json(res, status, {
            data: null,
            error: { code: status === 404 ? "NOT_FOUND" : "SAGA_RESUME_FAILED", message },
          });
        }
      }),
    ],
  });
}

main().catch((err) => {
  log.error("Orchestrator startup failed", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exitCode = 1;
});

// Export workflows and state machine for internal use (issue #7)
export { checkoutWorkflow, restorePurchaseWorkflow };
export { purchaseWorkflow } from "../workflows/purchase/index.js";
export { publishWorkflowEvent, createWorkflowCorrelationId } from "./workflow-events.js";
export type { WorkflowEventEnvelope } from "./workflow-events.js";
export { PurchaseWorkflowMachine } from "../state/index.js";
export type { WorkflowSnapshot, PurchaseState, PurchaseEvent } from "../state/index.js";
