import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@delego/utils";
import { extractAuth } from "../middleware/auth.js";
import { validateSchema, BulkUpdateApprovalsSchema } from "../src/validation.js";
import { Approval } from "../src/models/index.js";
import { readJsonBody, InvalidJsonError, BodyTooLargeError } from "../src/request.js";

function formatApprovalResponse(approval: Approval): any {
  return {
    id: approval.id,
    title: approval.title,
    description: approval.description,
    amountStroops: approval.amountStroops === null ? null : String(approval.amountStroops),
    requestedBy: approval.requestedBy,
    status: approval.status,
    createdAt: approval.createdAt.toISOString(),
    updatedAt: approval.updatedAt.toISOString(),
  };
}

export async function listApprovalsHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const auth = extractAuth(req);
    if (!auth.userId) {
      json(res, 401, { data: null, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
      return;
    }

    const approvals = await Approval.findAll({ where: { userId: auth.userId }, order: [["createdAt", "DESC"]] });
    json(res, 200, { data: approvals.map(formatApprovalResponse), error: null });
  } catch (err: any) {
    json(res, 500, { data: null, error: { code: "INTERNAL_ERROR", message: err.message } });
  }
}

export async function bulkUpdateApprovalsHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const auth = extractAuth(req);
    if (!auth.userId) {
      json(res, 401, { data: null, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
      return;
    }

    const body = await readJsonBody(req);
    const validation = validateSchema(BulkUpdateApprovalsSchema, body);
    if (!validation.valid) {
      json(res, 400, { data: null, error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: validation.errors } });
      return;
    }

    const [updated] = await Approval.update(
      { status: body.status },
      { where: { id: body.ids, userId: auth.userId, status: "pending" } }
    );

    json(res, 200, { data: { updated }, error: null });
  } catch (err: any) {
    if (err instanceof InvalidJsonError || err instanceof BodyTooLargeError) {
      json(res, 400, { data: null, error: { code: "VALIDATION_ERROR", message: err.message } });
    } else {
      json(res, 500, { data: null, error: { code: "INTERNAL_ERROR", message: err.message } });
    }
  }
}
