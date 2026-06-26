import type { IncomingMessage, ServerResponse } from "node:http";
import { generateId } from "@delego/utils";

export interface RequestContext {
  requestId: string;
  startedAt: number;
  userId?: string;
}

const contexts = new WeakMap<IncomingMessage, RequestContext>();

/** Retrieve the request context attached by requestIdMiddleware, if any. */
export function getRequestContext(req: IncomingMessage): RequestContext | undefined {
  return contexts.get(req);
}

/**
 * Accepts an inbound `X-Request-Id` header when present, otherwise generates one.
 * Exposes the id via getRequestContext() and sets it on the response.
 */
export function requestIdMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: (err?: any) => void): void => {
    const forwarded = req.headers["x-request-id"];
    const forwardedId = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const requestId = forwardedId?.trim() || generateId();

    contexts.set(req, { requestId, startedAt: Date.now() });
    res.setHeader("X-Request-Id", requestId);

    next();
  };
}
