import type { IncomingMessage } from "node:http";
import { verifyToken } from "../src/auth/authService.js";

export interface AuthContext {
  userId: string | null;
  token: string | null;
}

export interface AuthenticatedUserContext {
  userId: string;
  email: string;
  roles: string[];
}

const authenticatedUserContexts = new WeakMap<IncomingMessage, AuthenticatedUserContext>();

/**
 * Retrieve the typed authenticated-user context populated by extractAuth(),
 * instead of reading ad-hoc properties off the request.
 */
export function getAuthenticatedUserContext(req: IncomingMessage): AuthenticatedUserContext | undefined {
  return authenticatedUserContexts.get(req);
}

/**
 * Extract auth context from request headers.
 */
export function extractAuth(req: IncomingMessage): AuthContext {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return { userId: null, token: null };
  }

  const token = authHeader.slice(7);
  try {
    const decoded = verifyToken(token);
    authenticatedUserContexts.set(req, {
      userId: decoded.userId,
      email: decoded.email ?? "",
      roles: decoded.roles ?? [],
    });
    return { userId: decoded.userId, token };
  } catch (err) {
    return { userId: null, token: null };
  }
}

