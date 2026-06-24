import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@delego/utils";
import { registerUser, loginUser, refreshAccessToken, buildAuthorizationUrl, handleOAuthCallback } from "../src/auth/authService.js";
import { OAuthProviderError, OAuthConfigError, OAuthStateMismatchError } from "../src/auth/oauthService.js";
import { validateSchema, RegisterSchema, LoginSchema } from "../src/validation.js";
import { readJsonBody, InvalidJsonError, BodyTooLargeError } from "../src/request.js";

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

function setRefreshTokenCookie(res: ServerResponse, refreshToken: string): void {
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

export async function registerHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(req);
    const validation = validateSchema(RegisterSchema, body);
    if (!validation.valid) {
      json(res, 400, {
        data: null,
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: validation.errors },
      });
      return;
    }

    const result = await registerUser(body.email, body.password, body.displayName);
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

export async function loginHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(req);
    const validation = validateSchema(LoginSchema, body);
    if (!validation.valid) {
      json(res, 400, {
        data: null,
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: validation.errors },
      });
      return;
    }

    const result = await loginUser(body.email, body.password);
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

export async function refreshHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
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

    const result = await refreshAccessToken(refreshToken);
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

// ---------------------------------------------------------------------------
// OAuth2 / OpenID Connect handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/auth/oauth/:provider
 *
 * Initiates the OAuth2 authorization code flow by redirecting the browser to
 * the provider's authorization endpoint.  The CSRF `state` JWT is embedded in
 * the redirect URL and verified on callback.
 */
export async function oauthInitiateHandler(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
): Promise<void> {
  const provider = params.provider ?? "";
  try {
    const url = buildAuthorizationUrl(provider as "google" | "github");
    res.writeHead(302, { Location: url });
    res.end();
  } catch (err: any) {
    if (err instanceof OAuthConfigError) {
      json(res, 503, {
        data: null,
        error: { code: "OAUTH_CONFIG_ERROR", message: err.message },
      });
    } else if (err instanceof OAuthProviderError) {
      json(res, 400, {
        data: null,
        error: { code: "OAUTH_PROVIDER_ERROR", message: err.message },
      });
    } else {
      json(res, 500, {
        data: null,
        error: { code: "INTERNAL_ERROR", message: "Failed to initiate OAuth flow" },
      });
    }
  }
}

/**
 * GET /api/v1/auth/oauth/:provider/callback
 *
 * Handles the provider redirect after the user grants access.  Expects `code`
 * and `state` query parameters.  On success issues the standard auth response
 * envelope (access token in body, refresh token in HttpOnly cookie) — identical
 * to password login so callers can use a single token-handling path.
 */
export async function oauthCallbackHandler(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
): Promise<void> {
  const provider = params.provider ?? "";

  // Parse query string from the raw URL
  const rawUrl = req.url ?? "";
  const queryStart = rawUrl.indexOf("?");
  const searchParams = queryStart >= 0
    ? new URLSearchParams(rawUrl.slice(queryStart + 1))
    : new URLSearchParams();

  const code = searchParams.get("code") ?? "";
  const state = searchParams.get("state") ?? "";
  // Provider may send error instead of code (user denied)
  const providerError = searchParams.get("error");

  if (providerError) {
    const description = searchParams.get("error_description") ?? providerError;
    json(res, 400, {
      data: null,
      error: { code: "OAUTH_ACCESS_DENIED", message: description },
    });
    return;
  }

  if (!code || !state) {
    json(res, 400, {
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Missing required query parameters: code, state",
      },
    });
    return;
  }

  try {
    const result = await handleOAuthCallback(provider, code, state);
    setRefreshTokenCookie(res, result.refreshToken);
    json(res, result.isNewUser ? 201 : 200, {
      data: {
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        isNewUser: result.isNewUser,
      },
      error: null,
    });
  } catch (err: any) {
    if (err instanceof OAuthStateMismatchError) {
      json(res, 400, {
        data: null,
        error: { code: "OAUTH_STATE_MISMATCH", message: err.message },
      });
    } else if (err instanceof OAuthConfigError) {
      json(res, 503, {
        data: null,
        error: { code: "OAUTH_CONFIG_ERROR", message: err.message },
      });
    } else if (err instanceof OAuthProviderError) {
      json(res, 502, {
        data: null,
        error: { code: "OAUTH_PROVIDER_ERROR", message: err.message },
      });
    } else {
      json(res, 500, {
        data: null,
        error: { code: "INTERNAL_ERROR", message: "OAuth callback processing failed" },
      });
    }
  }
}
