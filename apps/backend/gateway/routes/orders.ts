import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@delego/utils";
import { extractAuth } from "../middleware/auth.js";
import {
  validateSchema,
  CreateOrderIssueSchema,
  CreateDisputeSchema,
} from "../src/validation.js";
import { Order, OrderIssue, Dispute } from "../src/models/index.js";
import { readJsonBody, InvalidJsonError, BodyTooLargeError } from "../src/request.js";

function formatOrderResponse(order: Order): any {
  return {
    id: order.id,
    userId: order.userId,
    delegationId: order.delegationId,
    merchantId: order.merchantId,
    status: order.status,
    lineItems: order.lineItems,
    totalStroops: String(order.totalStroops ?? 0),
    escrowContractId: order.escrowContractId,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function formatOrderIssueResponse(issue: OrderIssue): any {
  return {
    id: issue.id,
    orderId: issue.orderId,
    reporterUserId: issue.reporterUserId,
    category: issue.category,
    message: issue.message,
    photoUrl: issue.photoUrl,
    status: issue.status,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
    resolvedAt: issue.resolvedAt ? issue.resolvedAt.toISOString() : null,
  };
}

function formatDisputeResponse(dispute: Dispute): any {
  return {
    id: dispute.id,
    orderId: dispute.orderId,
    issueId: dispute.issueId,
    category: dispute.category,
    message: dispute.message,
    status: dispute.status,
    createdAt: dispute.createdAt.toISOString(),
    updatedAt: dispute.updatedAt.toISOString(),
  };
}

async function findOwnedOrder(orderId: string, userId: string): Promise<Order | null> {
  return Order.findOne({ where: { id: orderId, userId } });
}

export async function listOrdersHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const auth = extractAuth(req);
    if (!auth.userId) {
      json(res, 401, { data: null, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
      return;
    }

    const orders = await Order.findAll({ where: { userId: auth.userId }, order: [["createdAt", "DESC"]] });
    json(res, 200, { data: orders.map(formatOrderResponse), error: null });
  } catch (err: any) {
    json(res, 500, { data: null, error: { code: "INTERNAL_ERROR", message: err.message } });
  }
}

export async function getOrderHandler(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
  try {
    const auth = extractAuth(req);
    if (!auth.userId) {
      json(res, 401, { data: null, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
      return;
    }

    const order = await findOwnedOrder(params.id, auth.userId);
    if (!order) {
      json(res, 404, { data: null, error: { code: "NOT_FOUND", message: "Order not found" } });
      return;
    }

    json(res, 200, { data: formatOrderResponse(order), error: null });
  } catch (err: any) {
    json(res, 500, { data: null, error: { code: "INTERNAL_ERROR", message: err.message } });
  }
}

/** Create a lightweight "report a problem" issue on an order. Strictly separate from creating a Dispute. */
export async function createOrderIssueHandler(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
  try {
    const auth = extractAuth(req);
    if (!auth.userId) {
      json(res, 401, { data: null, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
      return;
    }

    const order = await findOwnedOrder(params.orderId, auth.userId);
    if (!order) {
      json(res, 404, { data: null, error: { code: "NOT_FOUND", message: "Order not found" } });
      return;
    }

    const body = await readJsonBody(req);
    const validation = validateSchema(CreateOrderIssueSchema, body);
    if (!validation.valid) {
      json(res, 400, { data: null, error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: validation.errors } });
      return;
    }

    const issue = await OrderIssue.create({
      orderId: order.id,
      reporterUserId: auth.userId,
      category: body.category,
      message: body.message ?? null,
      photoUrl: body.photoUrl ?? null,
      status: "open",
    });

    json(res, 201, { data: formatOrderIssueResponse(issue), error: null });
  } catch (err: any) {
    if (err instanceof InvalidJsonError || err instanceof BodyTooLargeError) {
      json(res, 400, { data: null, error: { code: "VALIDATION_ERROR", message: err.message } });
    } else {
      json(res, 500, { data: null, error: { code: "INTERNAL_ERROR", message: err.message } });
    }
  }
}

export async function listOrderIssuesHandler(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
  try {
    const auth = extractAuth(req);
    if (!auth.userId) {
      json(res, 401, { data: null, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
      return;
    }

    const order = await findOwnedOrder(params.orderId, auth.userId);
    if (!order) {
      json(res, 404, { data: null, error: { code: "NOT_FOUND", message: "Order not found" } });
      return;
    }

    const issues = await OrderIssue.findAll({ where: { orderId: order.id }, order: [["createdAt", "DESC"]] });
    json(res, 200, { data: issues.map(formatOrderIssueResponse), error: null });
  } catch (err: any) {
    json(res, 500, { data: null, error: { code: "INTERNAL_ERROR", message: err.message } });
  }
}

/**
 * Create a formal Dispute for an order. Never mutates an OrderIssue's status field directly with a
 * DisputeStatus value — if `issueId` is provided, the linked issue is moved to the issue-only
 * "escalated" state, which is a distinct string from any DisputeStatus value.
 */
export async function createDisputeHandler(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
  try {
    const auth = extractAuth(req);
    if (!auth.userId) {
      json(res, 401, { data: null, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
      return;
    }

    const order = await findOwnedOrder(params.orderId, auth.userId);
    if (!order) {
      json(res, 404, { data: null, error: { code: "NOT_FOUND", message: "Order not found" } });
      return;
    }

    const body = await readJsonBody(req);
    const validation = validateSchema(CreateDisputeSchema, body);
    if (!validation.valid) {
      json(res, 400, { data: null, error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: validation.errors } });
      return;
    }

    if (body.issueId) {
      const issue = await OrderIssue.findOne({ where: { id: body.issueId, orderId: order.id } });
      if (!issue) {
        json(res, 404, { data: null, error: { code: "NOT_FOUND", message: "Issue not found" } });
        return;
      }
    }

    const dispute = await Dispute.create({
      orderId: order.id,
      issueId: body.issueId ?? null,
      category: body.category,
      message: body.message,
      status: "open",
    });

    if (body.issueId) {
      await OrderIssue.update({ status: "escalated" }, { where: { id: body.issueId, orderId: order.id } });
    }

    json(res, 201, { data: formatDisputeResponse(dispute), error: null });
  } catch (err: any) {
    if (err instanceof InvalidJsonError || err instanceof BodyTooLargeError) {
      json(res, 400, { data: null, error: { code: "VALIDATION_ERROR", message: err.message } });
    } else {
      json(res, 500, { data: null, error: { code: "INTERNAL_ERROR", message: err.message } });
    }
  }
}
