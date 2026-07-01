import type { IncomingMessage, ServerResponse } from "node:http";
import { generateId, json } from "@delego/utils";
import * as authService from "../src/auth/authService.js";
import {
  publishAuthAuditEvent,
  AUTH_AUDIT_ACTIONS,
} from "../src/auth/authAuditEvent.js";
import {
  validateSchema,
  RegisterSchema,
  LoginSchema,
} from "../src/validation.js";
import {
  readJsonBody,
  InvalidJsonError,
  BodyTooLargeError,
} from "../src/request.js";
import { badRequest, sendApiError, unauthorized } from "../src/errors.js";
import { getRequestContext } from "../middleware/requestId.js";
import {
  extractAuth,
  getAuthenticatedUserContext,
} from "../middleware/auth.js";

export const authDependencies = {
  registerUser: authService.registerUser,
  loginUser: authService.loginUser,
  refreshAccessToken: authService.refreshAccessToken,
  logoutUser: authService.logoutUser,
};

function resolveRequestId(req: IncomingMessage): string {
  return getRequestContext(req)?.requestId ?? generateId();
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const list: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(";").forEach((cookie) => {
      const parts = cookie.split("=");
      if (parts.length >= 2) {
        const key = parts.shift()?.trim() ?? "";
        const value = decodeURIComponent(parts.join("=").trim());
        if (key) {
          list[key] = value;
        }
      }
    });
  }
  return list;
}

function setRefreshTokenCookie(
  res: ServerResponse,
  refreshToken: string,
): void {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const cookie = [
    `refresh_token=${refreshToken}`,
    `Expires=${expires.toUTCString()}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
  ].join("; ");
  res.setHeader("Set-Cookie", cookie);
}

function clearRefreshTokenCookie(res: ServerResponse): void {
  const cookie = [
    "refresh_token=",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
  ].join("; ");
  res.setHeader("Set-Cookie", cookie);
}

export async function registerHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const requestId = resolveRequestId(req);
  let email: string | undefined;

  try {
    const body = await readJsonBody(req);
    email = typeof body.email === "string" ? body.email : undefined;
    const validation = validateSchema(RegisterSchema, body);
    if (!validation.valid) {
      publishAuthAuditEvent({
        action: AUTH_AUDIT_ACTIONS.REGISTER,
        success: false,
        requestId,
        email,
      });
      badRequest(res, "Invalid request body", req, validation.errors);
      return;
    }

    const result = await authDependencies.registerUser(
      body.email,
      body.password,
      body.displayName,
    );
    publishAuthAuditEvent({
      action: AUTH_AUDIT_ACTIONS.REGISTER,
      success: true,
      requestId,
      userId: result.user.id,
      email: result.user.email,
    });
    setRefreshTokenCookie(res, result.refreshToken);
    json(res, 201, {
      data: {
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      },
      error: null,
    });
  } catch (err: any) {
    publishAuthAuditEvent({
      action: AUTH_AUDIT_ACTIONS.REGISTER,
      success: false,
      requestId,
      email,
    });
    if (err instanceof InvalidJsonError || err instanceof BodyTooLargeError) {
      badRequest(res, err.message, req);
    } else {
      sendApiError(res, 400, "BAD_REQUEST", err.message, req);
    }
  }
}

export async function loginHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const requestId = resolveRequestId(req);
  let email: string | undefined;

  try {
    const body = await readJsonBody(req);
    email = typeof body.email === "string" ? body.email : undefined;
    const validation = validateSchema(LoginSchema, body);
    if (!validation.valid) {
      publishAuthAuditEvent({
        action: AUTH_AUDIT_ACTIONS.LOGIN,
        success: false,
        requestId,
        email,
      });
      badRequest(res, "Invalid request body", req, validation.errors);
      return;
    }

    const result = await authDependencies.loginUser(body.email, body.password);
    publishAuthAuditEvent({
      action: AUTH_AUDIT_ACTIONS.LOGIN,
      success: true,
      requestId,
      userId: result.user.id,
      email: result.user.email,
    });
    setRefreshTokenCookie(res, result.refreshToken);
    json(res, 200, {
      data: {
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      },
      error: null,
    });
  } catch (err: any) {
    publishAuthAuditEvent({
      action: AUTH_AUDIT_ACTIONS.LOGIN,
      success: false,
      requestId,
      email,
    });
    if (err instanceof InvalidJsonError || err instanceof BodyTooLargeError) {
      badRequest(res, err.message, req);
    } else {
      unauthorized(res, err.message, req);
    }
  }
}

export async function refreshHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const requestId = resolveRequestId(req);

  try {
    const cookies = parseCookies(req);
    const refreshToken = cookies.refresh_token;

    if (!refreshToken) {
      publishAuthAuditEvent({
        action: AUTH_AUDIT_ACTIONS.REFRESH,
        success: false,
        requestId,
      });
      unauthorized(res, "Refresh token missing", req);
      return;
    }

    const result = await authDependencies.refreshAccessToken(refreshToken);
    publishAuthAuditEvent({
      action: AUTH_AUDIT_ACTIONS.REFRESH,
      success: true,
      requestId,
      userId: getAuthenticatedUserContext(req)?.userId,
      email: getAuthenticatedUserContext(req)?.email,
    });
    setRefreshTokenCookie(res, result.refreshToken);
    json(res, 200, {
      data: {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      },
      error: null,
    });
  } catch (err: any) {
    publishAuthAuditEvent({
      action: AUTH_AUDIT_ACTIONS.REFRESH,
      success: false,
      requestId,
    });
    unauthorized(res, err.message, req);
  }
}

export async function logoutHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const requestId = resolveRequestId(req);
  const auth = extractAuth(req);

  if (!auth.userId) {
    publishAuthAuditEvent({
      action: AUTH_AUDIT_ACTIONS.LOGOUT,
      success: false,
      requestId,
    });
    unauthorized(res, "Authentication required", req);
    return;
  }

  const cookies = parseCookies(req);
  await authDependencies.logoutUser(cookies.refresh_token);
  clearRefreshTokenCookie(res);

  publishAuthAuditEvent({
    action: AUTH_AUDIT_ACTIONS.LOGOUT,
    success: true,
    requestId,
    userId: auth.userId,
    email: getAuthenticatedUserContext(req)?.email,
  });

  json(res, 200, {
    data: { success: true },
    error: null,
  });
}
