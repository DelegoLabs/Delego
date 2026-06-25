import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@delego/utils";
import * as authService from "../src/auth/authService.js";
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

export const authDependencies = {
  registerUser: authService.registerUser,
  loginUser: authService.loginUser,
  refreshAccessToken: authService.refreshAccessToken,
};

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

export async function registerHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody(req);
    const validation = validateSchema(RegisterSchema, body);
    if (!validation.valid) {
      json(res, 400, {
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: validation.errors,
        },
      });
      return;
    }

    const result = await authDependencies.registerUser(
      body.email,
      body.password,
      body.displayName,
    );
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
    if (err instanceof InvalidJsonError || err instanceof BodyTooLargeError) {
      json(res, 400, {
        data: null,
        error: { code: "VALIDATION_ERROR", message: err.message },
      });
    } else {
      json(res, 400, {
        data: null,
        error: { code: "BAD_REQUEST", message: err.message },
      });
    }
  }
}

export async function loginHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody(req);
    const validation = validateSchema(LoginSchema, body);
    if (!validation.valid) {
      json(res, 400, {
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: validation.errors,
        },
      });
      return;
    }

    const result = await authDependencies.loginUser(body.email, body.password);
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
    if (err instanceof InvalidJsonError || err instanceof BodyTooLargeError) {
      json(res, 400, {
        data: null,
        error: { code: "VALIDATION_ERROR", message: err.message },
      });
    } else {
      json(res, 401, {
        data: null,
        error: { code: "UNAUTHORIZED", message: err.message },
      });
    }
  }
}

export async function refreshHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const cookies = parseCookies(req);
    const refreshToken = cookies.refresh_token;

    if (!refreshToken) {
      json(res, 401, {
        data: null,
        error: { code: "UNAUTHORIZED", message: "Refresh token missing" },
      });
      return;
    }

    const result = await authDependencies.refreshAccessToken(refreshToken);
    setRefreshTokenCookie(res, result.refreshToken);
    json(res, 200, {
      data: {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      },
      error: null,
    });
  } catch (err: any) {
    json(res, 401, {
      data: null,
      error: { code: "UNAUTHORIZED", message: err.message },
    });
  }
}

function clearRefreshTokenCookie(res: ServerResponse): void {
  const cookie = [
    "refresh_token=",
    `Expires=${new Date(0).toUTCString()}`,
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
  ].join("; ");
  res.setHeader("Set-Cookie", cookie);
}

export async function logoutHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      json(res, 401, {
        data: null,
        error: {
          code: "UNAUTHORIZED",
          message: "Missing Authorization header",
        },
      });
      return;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      json(res, 401, {
        data: null,
        error: {
          code: "UNAUTHORIZED",
          message: "Missing Authorization header",
        },
      });
      return;
    }

    // Clear the refresh token cookie
    clearRefreshTokenCookie(res);

    json(res, 200, {
      data: {
        success: true,
      },
      error: null,
    });
  } catch (err: any) {
    json(res, 500, {
      data: null,
      error: { code: "INTERNAL_ERROR", message: "Logout failed" },
    });
  }
}
