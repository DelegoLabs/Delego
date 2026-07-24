import type { IncomingMessage, ServerResponse } from "node:http";
import { route, json, type Route } from "@delego/utils";
import { escrowService } from "../escrow/index.js";
import { getPaymentsHealth } from "../escrow/health.js";
import {
  acquireLock,
  releaseLock,
  validateDepositRequest,
  validateEscrowContractConfig,
  validateIdempotencyKey,
  validateInitializeRequest,
  validateRefundRequest,
  validateReleaseRequest,
  type ValidationError,
} from "./validation.js";

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", (err) => {
      reject(err);
    });
  });
}

function validationStatusCode(code: string): number {
  return code === "CONFIG_ERROR" ? 503 : 400;
}

function sendValidationError(res: ServerResponse, error: ValidationError): void {
  json(res, validationStatusCode(error.code), { data: null, error });
}

function sendOperationError(res: ServerResponse, code: string, err: unknown): void {
  json(res, 400, {
    data: null,
    error: {
      code,
      message: err instanceof Error ? err.message : "Unknown error",
    },
  });
}

function isDuplicateKeyError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: string }).code;
    const message = (err as { message?: string }).message ?? "";
    return code === "23505" || message.includes("duplicate key") || message.includes("unique constraint");
  }
  return false;
}

async function ensureContractConfig(res: ServerResponse): Promise<boolean> {
  const config = validateEscrowContractConfig();
  if (!config.ok) {
    sendValidationError(res, config.error);
    return false;
  }
  return true;
}

export function registerRoutes(): Route[] {
  return [
    route("GET", "/escrow/health", async (_req, res) => {
      const health = await getPaymentsHealth();
      json(res, 200, { data: health, error: null });
    }),

    route("POST", "/escrow/initialize", async (req, res) => {
      try {
        const body = await readJsonBody(req);
        const validated = validateInitializeRequest(body);
        if (!validated.ok) {
          sendValidationError(res, validated.error);
          return;
        }
        if (!(await ensureContractConfig(res))) return;

        const result = await escrowService.initialize(validated.value);
        json(res, 200, { data: result, error: null });
      } catch (err) {
        if (err instanceof Error && err.message === "Invalid JSON body") {
          sendValidationError(res, {
            code: "VALIDATION_ERROR",
            message: "Invalid JSON body",
          });
          return;
        }
        sendOperationError(res, "ESCROW_INITIALIZE_FAILED", err);
      }
    }),

    route("POST", "/escrow/deposit", async (req, res) => {
      let lockedOrderId: string | undefined;
      try {
        const idempotency = validateIdempotencyKey(req.headers as Record<string, string | string[] | undefined>, "/escrow/deposit");
        if (!idempotency.ok) {
          sendValidationError(res, idempotency.error);
          return;
        }
        const body = await readJsonBody(req);
        const validated = validateDepositRequest(body);
        if (!validated.ok) {
          sendValidationError(res, validated.error);
          return;
        }
        if (!(await ensureContractConfig(res))) return;

        if (validated.value.orderId) {
          lockedOrderId = validated.value.orderId;
          const acquired = await acquireLock(lockedOrderId);
          if (!acquired) {
            json(res, 409, {
              data: null,
              error: {
                code: "DUPLICATE_FUNDING_REQUEST",
                message: `Escrow deposit is already in progress for order ${lockedOrderId}`,
                details: { orderId: lockedOrderId },
              },
            });
            return;
          }
        }

        const result = await escrowService.deposit(validated.value);
        json(res, 200, { data: result, error: null });
      } catch (err) {
        if (err instanceof Error && err.message === "Invalid JSON body") {
          sendValidationError(res, {
            code: "VALIDATION_ERROR",
            message: "Invalid JSON body",
          });
          return;
        }
        if (isDuplicateKeyError(err)) {
          json(res, 409, {
            data: null,
            error: {
              code: "DUPLICATE_FUNDING_REQUEST",
              message: "Escrow deposit record already exists for this order",
              details: { orderId: lockedOrderId },
            },
          });
          return;
        }
        sendOperationError(res, "ESCROW_DEPOSIT_FAILED", err);
      } finally {
        if (lockedOrderId) {
          await releaseLock(lockedOrderId);
        }
      }
    }),


    route("POST", "/escrow/:escrowId/release", async (req, res, params) => {
      try {
        const idempotency = validateIdempotencyKey(req.headers as Record<string, string | string[] | undefined>, "/escrow/:escrowId/release");
        if (!idempotency.ok) {
          sendValidationError(res, idempotency.error);
          return;
        }
        const body = await readJsonBody(req);
        const validated = validateReleaseRequest(body, params.escrowId);
        if (!validated.ok) {
          sendValidationError(res, validated.error);
          return;
        }
        if (!(await ensureContractConfig(res))) return;

        const result = await escrowService.release(validated.value);
        json(res, 200, { data: result, error: null });
      } catch (err) {
        if (err instanceof Error && err.message === "Invalid JSON body") {
          sendValidationError(res, {
            code: "VALIDATION_ERROR",
            message: "Invalid JSON body",
          });
          return;
        }
        sendOperationError(res, "ESCROW_RELEASE_FAILED", err);
      }
    }),

    route("POST", "/escrow/:escrowId/refund", async (req, res, params) => {
      try {
        const idempotency = validateIdempotencyKey(req.headers as Record<string, string | string[] | undefined>, "/escrow/:escrowId/refund");
        if (!idempotency.ok) {
          sendValidationError(res, idempotency.error);
          return;
        }
        const body = await readJsonBody(req);
        const validated = validateRefundRequest(body, params.escrowId);
        if (!validated.ok) {
          sendValidationError(res, validated.error);
          return;
        }
        if (!(await ensureContractConfig(res))) return;

        const result = await escrowService.refund(validated.value);
        json(res, 200, {
          data: {
            ...result,
            refundReasonCode: validated.value.refundReasonCode,
          },
          error: null,
        });

      } catch (err) {
        if (err instanceof Error && err.message === "Invalid JSON body") {
          sendValidationError(res, {
            code: "VALIDATION_ERROR",
            message: "Invalid JSON body",
          });
          return;
        }
        sendOperationError(res, "ESCROW_REFUND_FAILED", err);
      }
    }),
  ];
}
